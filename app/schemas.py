from pydantic import BaseModel
from typing import Optional, Union
from datetime import date, datetime


# ---- Group ----
class GroupCreate(BaseModel):
    name: str
    kindergarten_name: str
    exchange_rate: float = 1.95583


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    kindergarten_name: Optional[str] = None
    exchange_rate: Optional[float] = None


class GroupOut(BaseModel):
    id: str
    name: str
    kindergarten_name: str
    exchange_rate: float
    created_at: datetime

    class Config:
        from_attributes = True


# ---- Student ----
class StudentCreate(BaseModel):
    full_name: str
    sibling_group_id: Optional[str] = None


class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    sibling_group_id: Optional[str] = None


class StudentOut(BaseModel):
    id: str
    group_id: str
    full_name: str
    display_number: Optional[int] = None
    status: str
    unenrolled_at: Optional[date] = None
    sibling_group_id: Optional[str] = None
    balance_bgn: float = 0.0
    balance_eur: float = 0.0

    class Config:
        from_attributes = True


# ---- Transaction ----
class DepositCreate(BaseModel):
    student_ids: list[str]
    amount: float
    currency: str = "BGN"  # "BGN" or "EUR"
    date: date
    reason: str = "захранване"


class ExpenseCreate(BaseModel):
    student_ids: list[str]
    total_amount: float
    currency: str = "BGN"
    date: date
    reason: str
    category_id: Optional[str] = None
    invoice_number: Optional[str] = None


class TransactionOut(BaseModel):
    id: str
    student_id: str
    student_name: str = ""
    amount_bgn: float
    amount_eur: float
    date: date
    reason: str
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    expense_batch_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ---- ExpenseCategory ----
class CategoryCreate(BaseModel):
    name: str


class CategoryOut(BaseModel):
    id: str
    group_id: str
    name: str

    class Config:
        from_attributes = True


# ---- Invoice ----
class InvoiceCreate(BaseModel):
    total_amount: float
    description: str
    date: date
    invoice_number: Optional[str] = None
    currency: str = "BGN"
    student_ids: list[str] = []
    category_id: Optional[str] = None


class InvoiceUpdate(BaseModel):
    total_amount: float
    per_child_cost: float
    description: str
    date: date
    invoice_number: Optional[str] = None
    currency: str = "BGN"
    num_children: Optional[int] = None


class InvoiceOut(BaseModel):
    id: str
    group_id: str
    expense_batch_id: Optional[str] = None
    total_amount: float
    per_child_cost: float
    description: str
    date: date
    invoice_number: Optional[str] = None
    currency: str
    num_children: Optional[int] = None

    class Config:
        from_attributes = True


# ---- Dashboard ----
class DashboardOut(BaseModel):
    total_balance_bgn: float
    total_balance_eur: float
    active_students: int
    unenrolled_students: int
    total_deposits_bgn: float
    total_expenses_bgn: float
    recent_transactions: list[TransactionOut]


# ---- Sibling link ----
class SiblingLink(BaseModel):
    student_ids: list[str]
