import uuid
from datetime import date
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import engine, Base, get_db, SessionLocal
from app.models import Group, Student, Transaction, ExpenseCategory, Invoice
from app import schemas
from app.backup import save_backup

import os
import logging
import asyncio
import httpx

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

Base.metadata.create_all(bind=engine)

app = FastAPI(title="FinWallet DG")


# ===================== SELF-PING (keep Render alive) =====================

SELF_PING_URL = os.environ.get("RENDER_EXTERNAL_URL")  # set automatically by Render
SELF_PING_INTERVAL = int(os.environ.get("SELF_PING_INTERVAL", "600"))  # 10 min


async def _self_ping():
    """Ping ourselves every 10 minutes to prevent Render free tier spin-down."""
    if not SELF_PING_URL:
        return  # not on Render, skip
    await asyncio.sleep(30)  # wait for startup
    async with httpx.AsyncClient() as client:
        while True:
            try:
                await client.get(f"{SELF_PING_URL}/api/health", timeout=10)
                logger.info("Self-ping OK")
            except Exception as e:
                logger.warning("Self-ping failed: %s", e)
            await asyncio.sleep(SELF_PING_INTERVAL)


@app.on_event("startup")
async def start_self_ping():
    asyncio.create_task(_self_ping())


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


class BackupMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.method in ("POST", "PUT", "DELETE") and response.status_code < 400:
            try:
                db = SessionLocal()
                save_backup(db)
                db.close()
            except Exception as e:
                logger.warning("Backup failed: %s", e)
        return response


app.add_middleware(BackupMiddleware)

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")


@app.get("/")
async def root():
    return FileResponse(os.path.join(BASE_DIR, "static", "index.html"))


# ===================== GROUPS =====================

@app.get("/api/groups", response_model=list[schemas.GroupOut])
def list_groups(db: Session = Depends(get_db)):
    return db.query(Group).order_by(Group.name).all()


@app.post("/api/groups", response_model=schemas.GroupOut)
def create_group(data: schemas.GroupCreate, db: Session = Depends(get_db)):
    group = Group(name=data.name, kindergarten_name=data.kindergarten_name, exchange_rate=data.exchange_rate)
    db.add(group)
    db.flush()

    # Seed default categories
    defaults = [
        "Театрални посещения",
        "Мебели и оборудване",
        "Подаръци за персонала",
        "Материали и консумативи",
        "Завършване",
        "Възстановяване",
    ]
    for name in defaults:
        db.add(ExpenseCategory(group_id=group.id, name=name))

    db.commit()
    db.refresh(group)
    return group


@app.get("/api/groups/{group_id}", response_model=schemas.GroupOut)
def get_group(group_id: str, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(404, "Group not found")
    return group


@app.put("/api/groups/{group_id}", response_model=schemas.GroupOut)
def update_group(group_id: str, data: schemas.GroupUpdate, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(404, "Group not found")
    if data.name is not None:
        group.name = data.name
    if data.kindergarten_name is not None:
        group.kindergarten_name = data.kindergarten_name
    if data.exchange_rate is not None:
        group.exchange_rate = data.exchange_rate
    db.commit()
    db.refresh(group)
    return group


@app.delete("/api/groups/{group_id}")
def delete_group(group_id: str, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(404, "Group not found")
    db.delete(group)
    db.commit()
    return {"ok": True}


# ===================== STUDENTS =====================

def _renumber_students(db: Session, group_id: str):
    """Renumber active students sequentially."""
    students = (
        db.query(Student)
        .filter(Student.group_id == group_id, Student.status == "active")
        .order_by(Student.display_number.nullsfirst(), Student.full_name)
        .all()
    )
    seen_sibling_groups = {}
    num = 1
    for s in students:
        if s.sibling_group_id and s.sibling_group_id in seen_sibling_groups:
            s.display_number = seen_sibling_groups[s.sibling_group_id]
        else:
            s.display_number = num
            if s.sibling_group_id:
                seen_sibling_groups[s.sibling_group_id] = num
            num += 1


def _student_balance(db: Session, student_id: str):
    row = (
        db.query(
            func.coalesce(func.sum(Transaction.amount_bgn), 0),
            func.coalesce(func.sum(Transaction.amount_eur), 0),
        )
        .filter(Transaction.student_id == student_id)
        .first()
    )
    return round(row[0], 2), round(row[1], 2)


def _student_out(db: Session, student: Student) -> schemas.StudentOut:
    bal_bgn, bal_eur = _student_balance(db, student.id)
    return schemas.StudentOut(
        id=student.id,
        group_id=student.group_id,
        full_name=student.full_name,
        display_number=student.display_number,
        status=student.status,
        unenrolled_at=student.unenrolled_at,
        sibling_group_id=student.sibling_group_id,
        balance_bgn=bal_bgn,
        balance_eur=bal_eur,
    )


@app.get("/api/groups/{group_id}/students", response_model=list[schemas.StudentOut])
def list_students(group_id: str, status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Student).filter(Student.group_id == group_id)
    if status:
        q = q.filter(Student.status == status)
    students = q.order_by(Student.display_number.nullsfirst(), Student.full_name).all()
    return [_student_out(db, s) for s in students]


@app.post("/api/groups/{group_id}/students", response_model=schemas.StudentOut)
def create_student(group_id: str, data: schemas.StudentCreate, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(404, "Group not found")
    student = Student(group_id=group_id, full_name=data.full_name, sibling_group_id=data.sibling_group_id)
    db.add(student)
    db.flush()
    _renumber_students(db, group_id)
    db.commit()
    db.refresh(student)
    return _student_out(db, student)


@app.put("/api/students/{student_id}", response_model=schemas.StudentOut)
def update_student(student_id: str, data: schemas.StudentUpdate, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(404, "Student not found")
    if data.full_name is not None:
        student.full_name = data.full_name
    if data.sibling_group_id is not None:
        student.sibling_group_id = data.sibling_group_id or None
    db.flush()
    _renumber_students(db, student.group_id)
    db.commit()
    db.refresh(student)
    return _student_out(db, student)


@app.delete("/api/students/{student_id}")
def delete_student(student_id: str, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(404, "Student not found")
    gid = student.group_id
    db.delete(student)
    db.flush()
    _renumber_students(db, gid)
    db.commit()
    return {"ok": True}


@app.post("/api/students/{student_id}/unenroll", response_model=schemas.StudentOut)
def unenroll_student(student_id: str, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(404, "Student not found")
    student.status = "unenrolled"
    student.unenrolled_at = date.today()
    db.flush()
    _renumber_students(db, student.group_id)
    db.commit()
    db.refresh(student)
    return _student_out(db, student)


@app.post("/api/students/{student_id}/reenroll", response_model=schemas.StudentOut)
def reenroll_student(student_id: str, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(404, "Student not found")
    student.status = "active"
    student.unenrolled_at = None
    db.flush()
    _renumber_students(db, student.group_id)
    db.commit()
    db.refresh(student)
    return _student_out(db, student)


@app.post("/api/groups/{group_id}/link-siblings")
def link_siblings(group_id: str, data: schemas.SiblingLink, db: Session = Depends(get_db)):
    if len(data.student_ids) < 2:
        raise HTTPException(400, "Need at least 2 students to link")
    sibling_id = str(uuid.uuid4())
    for sid in data.student_ids:
        student = db.query(Student).filter(Student.id == sid, Student.group_id == group_id).first()
        if not student:
            raise HTTPException(404, f"Student {sid} not found in group")
        student.sibling_group_id = sibling_id
    _renumber_students(db, group_id)
    db.commit()
    return {"ok": True, "sibling_group_id": sibling_id}


@app.post("/api/students/{student_id}/unlink-sibling", response_model=schemas.StudentOut)
def unlink_sibling(student_id: str, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(404, "Student not found")
    student.sibling_group_id = None
    db.flush()
    _renumber_students(db, student.group_id)
    db.commit()
    db.refresh(student)
    return _student_out(db, student)


# ===================== TRANSACTIONS =====================

def _convert_currency(amount: float, currency: str, rate: float):
    """Return (bgn, eur) tuple."""
    if currency == "BGN":
        return round(amount, 2), round(amount / rate, 2)
    else:
        return round(amount * rate, 2), round(amount, 2)


def _tx_out(tx: Transaction) -> schemas.TransactionOut:
    return schemas.TransactionOut(
        id=tx.id,
        student_id=tx.student_id,
        student_name=tx.student.full_name if tx.student else "",
        amount_bgn=tx.amount_bgn,
        amount_eur=tx.amount_eur,
        date=tx.date,
        reason=tx.reason,
        category_id=tx.category_id,
        category_name=tx.category.name if tx.category else None,
        expense_batch_id=tx.expense_batch_id,
        created_at=tx.created_at,
    )


@app.get("/api/groups/{group_id}/transactions", response_model=list[schemas.TransactionOut])
def list_transactions(
    group_id: str,
    student_id: Optional[str] = None,
    category_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    tx_type: Optional[str] = None,  # "deposit" or "expense"
    search: Optional[str] = None,
    limit: int = Query(500, le=5000),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    q = (
        db.query(Transaction)
        .join(Student)
        .filter(Student.group_id == group_id)
    )
    if student_id:
        q = q.filter(Transaction.student_id == student_id)
    if category_id:
        q = q.filter(Transaction.category_id == category_id)
    if date_from:
        q = q.filter(Transaction.date >= date_from)
    if date_to:
        q = q.filter(Transaction.date <= date_to)
    if tx_type == "deposit":
        q = q.filter(Transaction.amount_bgn > 0)
    elif tx_type == "expense":
        q = q.filter(Transaction.amount_bgn < 0)
    if search:
        q = q.filter(Transaction.reason.ilike(f"%{search}%"))

    txs = q.order_by(Transaction.date.desc(), Transaction.created_at.desc()).offset(offset).limit(limit).all()
    return [_tx_out(tx) for tx in txs]


@app.post("/api/groups/{group_id}/deposits", response_model=list[schemas.TransactionOut])
def create_deposit(group_id: str, data: schemas.DepositCreate, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(404, "Group not found")

    bgn, eur = _convert_currency(data.amount, data.currency, group.exchange_rate)
    results = []
    for sid in data.student_ids:
        student = db.query(Student).filter(Student.id == sid, Student.group_id == group_id).first()
        if not student:
            raise HTTPException(404, f"Student {sid} not found")
        tx = Transaction(
            student_id=sid,
            amount_bgn=bgn,
            amount_eur=eur,
            date=data.date,
            reason=data.reason,
        )
        db.add(tx)
        db.flush()
        results.append(tx)

    db.commit()
    for tx in results:
        db.refresh(tx)
    return [_tx_out(tx) for tx in results]


@app.post("/api/groups/{group_id}/expenses", response_model=list[schemas.TransactionOut])
def create_expense(group_id: str, data: schemas.ExpenseCreate, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(404, "Group not found")

    if not data.student_ids:
        raise HTTPException(400, "No students selected")

    n = len(data.student_ids)
    per_child = round(data.total_amount / n, 2)
    per_bgn, per_eur = _convert_currency(per_child, data.currency, group.exchange_rate)
    # Make negative for expense
    per_bgn = -abs(per_bgn)
    per_eur = -abs(per_eur)

    batch_id = str(uuid.uuid4())
    results = []

    for sid in data.student_ids:
        student = db.query(Student).filter(Student.id == sid, Student.group_id == group_id).first()
        if not student:
            raise HTTPException(404, f"Student {sid} not found")
        tx = Transaction(
            student_id=sid,
            amount_bgn=per_bgn,
            amount_eur=per_eur,
            date=data.date,
            reason=data.reason,
            category_id=data.category_id,
            expense_batch_id=batch_id,
        )
        db.add(tx)
        db.flush()
        results.append(tx)

    # Auto-create invoice record
    total_bgn, total_eur = _convert_currency(data.total_amount, data.currency, group.exchange_rate)
    invoice = Invoice(
        group_id=group_id,
        expense_batch_id=batch_id,
        total_amount=data.total_amount,
        per_child_cost=per_child,
        description=data.reason,
        date=data.date,
        invoice_number=data.invoice_number,
        currency=data.currency,
        num_children=n,
    )
    db.add(invoice)

    db.commit()
    for tx in results:
        db.refresh(tx)
    return [_tx_out(tx) for tx in results]


# ===================== BALANCES =====================

@app.get("/api/groups/{group_id}/balances")
def get_balances(group_id: str, db: Session = Depends(get_db)):
    students = (
        db.query(Student)
        .filter(Student.group_id == group_id)
        .order_by(Student.status, Student.display_number.nullsfirst(), Student.full_name)
        .all()
    )
    active = []
    unenrolled = []
    for s in students:
        out = _student_out(db, s)
        if s.status == "active":
            active.append(out)
        else:
            unenrolled.append(out)

    group = db.query(Group).filter(Group.id == group_id).first()
    return {
        "exchange_rate": group.exchange_rate if group else 1.95583,
        "active": [s.model_dump() for s in active],
        "unenrolled": [s.model_dump() for s in unenrolled],
        "total_active_bgn": round(sum(s.balance_bgn for s in active), 2),
        "total_active_eur": round(sum(s.balance_eur for s in active), 2),
        "total_unenrolled_bgn": round(sum(s.balance_bgn for s in unenrolled), 2),
        "total_unenrolled_eur": round(sum(s.balance_eur for s in unenrolled), 2),
    }


# ===================== CATEGORIES =====================

@app.get("/api/groups/{group_id}/categories", response_model=list[schemas.CategoryOut])
def list_categories(group_id: str, db: Session = Depends(get_db)):
    return db.query(ExpenseCategory).filter(ExpenseCategory.group_id == group_id).order_by(ExpenseCategory.name).all()


@app.post("/api/groups/{group_id}/categories", response_model=schemas.CategoryOut)
def create_category(group_id: str, data: schemas.CategoryCreate, db: Session = Depends(get_db)):
    cat = ExpenseCategory(group_id=group_id, name=data.name)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@app.put("/api/categories/{cat_id}", response_model=schemas.CategoryOut)
def update_category(cat_id: str, data: schemas.CategoryCreate, db: Session = Depends(get_db)):
    cat = db.query(ExpenseCategory).filter(ExpenseCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    cat.name = data.name
    db.commit()
    db.refresh(cat)
    return cat


@app.delete("/api/categories/{cat_id}")
def delete_category(cat_id: str, db: Session = Depends(get_db)):
    cat = db.query(ExpenseCategory).filter(ExpenseCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    db.delete(cat)
    db.commit()
    return {"ok": True}


# ===================== INVOICES =====================

@app.get("/api/groups/{group_id}/invoices", response_model=list[schemas.InvoiceOut])
def list_invoices(group_id: str, db: Session = Depends(get_db)):
    return (
        db.query(Invoice)
        .filter(Invoice.group_id == group_id)
        .order_by(Invoice.date.desc())
        .all()
    )


@app.post("/api/groups/{group_id}/invoices", response_model=schemas.InvoiceOut)
def create_invoice(group_id: str, data: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(404, "Group not found")

    batch_id = str(uuid.uuid4())
    n = len(data.student_ids) if data.student_ids else 0
    per_child = round(data.total_amount / n, 2) if n > 0 else data.total_amount

    # Create linked expense transactions for each selected student
    if data.student_ids:
        per_bgn, per_eur = _convert_currency(per_child, data.currency, group.exchange_rate)
        per_bgn = -abs(per_bgn)
        per_eur = -abs(per_eur)
        for sid in data.student_ids:
            student = db.query(Student).filter(Student.id == sid, Student.group_id == group_id).first()
            if not student:
                raise HTTPException(404, f"Student {sid} not found")
            tx = Transaction(
                student_id=sid,
                amount_bgn=per_bgn,
                amount_eur=per_eur,
                date=data.date,
                reason=data.description,
                category_id=data.category_id,
                expense_batch_id=batch_id,
            )
            db.add(tx)

    inv = Invoice(
        group_id=group_id,
        expense_batch_id=batch_id if data.student_ids else None,
        total_amount=data.total_amount,
        per_child_cost=per_child,
        description=data.description,
        date=data.date,
        invoice_number=data.invoice_number,
        currency=data.currency,
        num_children=n or None,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


@app.put("/api/invoices/{inv_id}", response_model=schemas.InvoiceOut)
def update_invoice(inv_id: str, data: schemas.InvoiceUpdate, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == inv_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")

    # Update linked transactions if this invoice was auto-created from an expense
    if inv.expense_batch_id:
        linked_txs = db.query(Transaction).filter(Transaction.expense_batch_id == inv.expense_batch_id).all()
        if linked_txs:
            group = db.query(Group).filter(Group.id == inv.group_id).first()
            rate = group.exchange_rate if group else 1.95583
            n = len(linked_txs)
            per_child = round(data.total_amount / n, 2)
            per_bgn, per_eur = _convert_currency(per_child, data.currency, rate)
            per_bgn = -abs(per_bgn)
            per_eur = -abs(per_eur)
            for tx in linked_txs:
                tx.amount_bgn = per_bgn
                tx.amount_eur = per_eur
                tx.date = data.date
                tx.reason = data.description
            inv.per_child_cost = per_child
            inv.num_children = n

    inv.total_amount = data.total_amount
    inv.description = data.description
    inv.date = data.date
    inv.invoice_number = data.invoice_number
    inv.currency = data.currency
    if data.num_children is not None:
        inv.num_children = data.num_children
    db.commit()
    db.refresh(inv)
    return inv


@app.delete("/api/invoices/{inv_id}")
def delete_invoice(inv_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == inv_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    # Delete linked transactions
    if inv.expense_batch_id:
        db.query(Transaction).filter(Transaction.expense_batch_id == inv.expense_batch_id).delete()
    db.delete(inv)
    db.commit()
    return {"ok": True}


# ===================== DASHBOARD =====================

@app.get("/api/groups/{group_id}/dashboard", response_model=schemas.DashboardOut)
def dashboard(group_id: str, db: Session = Depends(get_db)):
    active_count = db.query(Student).filter(Student.group_id == group_id, Student.status == "active").count()
    unenrolled_count = db.query(Student).filter(Student.group_id == group_id, Student.status == "unenrolled").count()

    students = db.query(Student).filter(Student.group_id == group_id, Student.status == "active").all()
    total_bgn = 0.0
    total_eur = 0.0
    for s in students:
        b, e = _student_balance(db, s.id)
        total_bgn += b
        total_eur += e

    dep_sum = (
        db.query(func.coalesce(func.sum(Transaction.amount_bgn), 0))
        .join(Student)
        .filter(Student.group_id == group_id, Transaction.amount_bgn > 0)
        .scalar()
    )
    exp_sum = (
        db.query(func.coalesce(func.sum(Transaction.amount_bgn), 0))
        .join(Student)
        .filter(Student.group_id == group_id, Transaction.amount_bgn < 0)
        .scalar()
    )

    recent = (
        db.query(Transaction)
        .join(Student)
        .filter(Student.group_id == group_id)
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .limit(10)
        .all()
    )

    return schemas.DashboardOut(
        total_balance_bgn=round(total_bgn, 2),
        total_balance_eur=round(total_eur, 2),
        active_students=active_count,
        unenrolled_students=unenrolled_count,
        total_deposits_bgn=round(dep_sum, 2),
        total_expenses_bgn=round(abs(exp_sum), 2),
        recent_transactions=[_tx_out(tx) for tx in recent],
    )
