import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, Float, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Group(Base):
    __tablename__ = "groups"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    kindergarten_name = Column(String, nullable=False)
    exchange_rate = Column(Float, default=1.95583)
    created_at = Column(DateTime, default=datetime.utcnow)

    students = relationship("Student", back_populates="group", cascade="all, delete-orphan")
    categories = relationship("ExpenseCategory", back_populates="group", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="group", cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = "students"

    id = Column(String, primary_key=True, default=gen_uuid)
    group_id = Column(String, ForeignKey("groups.id"), nullable=False)
    full_name = Column(String, nullable=False)
    display_number = Column(Integer, nullable=True)
    status = Column(String, default="active")  # "active" or "unenrolled"
    unenrolled_at = Column(Date, nullable=True)
    sibling_group_id = Column(String, nullable=True)

    group = relationship("Group", back_populates="students")
    transactions = relationship("Transaction", back_populates="student", cascade="all, delete-orphan")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True, default=gen_uuid)
    student_id = Column(String, ForeignKey("students.id"), nullable=False)
    amount_bgn = Column(Float, nullable=False)
    amount_eur = Column(Float, nullable=False)
    date = Column(Date, nullable=False)
    reason = Column(String, nullable=False)
    category_id = Column(String, ForeignKey("expense_categories.id"), nullable=True)
    expense_batch_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    student = relationship("Student", back_populates="transactions")
    category = relationship("ExpenseCategory")


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id = Column(String, primary_key=True, default=gen_uuid)
    group_id = Column(String, ForeignKey("groups.id"), nullable=False)
    name = Column(String, nullable=False)

    group = relationship("Group", back_populates="categories")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String, primary_key=True, default=gen_uuid)
    group_id = Column(String, ForeignKey("groups.id"), nullable=False)
    expense_batch_id = Column(String, nullable=True)
    total_amount = Column(Float, nullable=False)
    per_child_cost = Column(Float, nullable=False)
    description = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    invoice_number = Column(String, nullable=True)
    currency = Column(String, nullable=False, default="BGN")
    num_children = Column(Integer, nullable=True)

    group = relationship("Group", back_populates="invoices")
