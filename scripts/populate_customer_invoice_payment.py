"""
Populates dbo.Customer, dbo.Invoice, and dbo.Payment in SQL Server with realistic synthetic data
aligned with the FinLake PaySim dataset timeline (January 2023).
"""

import os
import random
from datetime import datetime, timedelta
import pymssql

# Seed for reproducible generation
random.seed(42)

SQLSERVER_HOST = os.getenv("SQLSERVER_HOST", "127.0.0.1")
SQLSERVER_PORT = int(os.getenv("SQLSERVER_PORT", "1433"))
SQLSERVER_USER = os.getenv("SQLSERVER_USER", "sa")
SQLSERVER_PASSWORD = os.getenv("SQLSERVER_SA_PASSWORD", "FinLake2026!StrongPass#")
SQLSERVER_DB = os.getenv("SQLSERVER_DATABASE", "finlake_source")

FIRST_NAMES = [
    "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
    "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
    "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley",
    "Steven", "Kimberly", "Paul", "Emily", "Andrew", "Donna", "Joshua", "Michelle",
    "Kenneth", "Dorothy", "Kevin", "Carol", "Brian", "Amanda", "George", "Melissa",
    "Edward", "Deborah", "Ronald", "Stephanie", "Timothy", "Rebecca", "Jason", "Sharon",
    "Jeffrey", "Laura", "Ryan", "Cynthia", "Jacob", "Kathleen", "Gary", "Amy",
    "Nicholas", "Shirley", "Eric", "Angela", "Jonathan", "Helen", "Stephen", "Anna",
    "Larry", "Brenda", "Justin", "Pamela", "Scott", "Nicole", "Brandon", "Emma",
    "Benjamin", "Samantha", "Samuel", "Katherine", "Gregory", "Christine", "Alexander", "Debra",
    "Patrick", "Rachel", "Frank", "Catherine", "Raymond", "Carolyn", "Jack", "Janet",
    "Dennis", "Ruth", "Jerry", "Maria", "Tyler", "Heather", "Aaron", "Diane"
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
    "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
    "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
    "Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker",
    "Cruz", "Edwards", "Collins", "Reyes", "Stewart", "Morris", "Morales", "Murphy",
    "Cook", "Rogers", "Gutierrez", "Ortiz", "Morgan", "Cooper", "Peterson", "Bailey",
    "Reed", "Kelly", "Howard", "Ramos", "Kim", "Cox", "Ward", "Richardson", "Watson",
    "Brooks", "Chavez", "Wood", "James", "Bennett", "Gray", "Mendoza", "Ruiz", "Hughes",
    "Price", "Alvarez", "Castillo", "Sanders", "Patel", "Myers", "Long", "Ross", "Foster"
]

CITIES = [
    "New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia",
    "San Antonio", "San Diego", "Dallas", "San Jose", "Austin", "Jacksonville",
    "Fort Worth", "Columbus", "Charlotte", "Indianapolis", "San Francisco", "Seattle",
    "Denver", "Oklahoma City", "Nashville", "El Paso", "Washington", "Boston",
    "Las Vegas", "Portland", "Detroit", "Louisville", "Memphis", "Baltimore",
    "Milwaukee", "Albuquerque", "Tucson", "Fresno", "Sacramento", "Atlanta",
    "Kansas City", "Miami", "Raleigh", "Omaha", "Oakland", "Minneapolis", "Tulsa"
]

STATUSES = ["PAID", "PAID", "PAID", "PENDING", "OVERDUE", "CANCELLED"]
PAYMENT_METHODS = ["CREDIT_CARD", "BANK_TRANSFER", "PAYPAL", "MOBILE_MONEY"]


def main():
    print(f"Connecting to SQL Server at {SQLSERVER_HOST}:{SQLSERVER_PORT}/{SQLSERVER_DB}...")
    conn = pymssql.connect(
        server=SQLSERVER_HOST,
        port=SQLSERVER_PORT,
        user=SQLSERVER_USER,
        password=SQLSERVER_PASSWORD,
        database=SQLSERVER_DB,
        autocommit=False,
    )
    cursor = conn.cursor()

    try:
        # Check current row counts
        cursor.execute("SELECT COUNT(*) FROM dbo.Customer;")
        cust_count = cursor.fetchone()[0]
        if cust_count > 0:
            print(f"[INFO] Customer table already has {cust_count} rows. Cleaning up for clean reload...")
            cursor.execute("DELETE FROM dbo.Payment; DELETE FROM dbo.Invoice; DELETE FROM dbo.Customer;")
            conn.commit()

        # ---------------------------------------------------------------------
        # 1. Insert 10,000 Customers
        # ---------------------------------------------------------------------
        print("Generating 10,000 customers...")
        customers = []
        base_created = datetime(2022, 1, 1)

        for i in range(1, 10001):
            fn = random.choice(FIRST_NAMES)
            ln = random.choice(LAST_NAMES)
            email = f"{fn.lower()}.{ln.lower()}.{i}@finlake-example.com"
            city = random.choice(CITIES)
            created_at = base_created + timedelta(days=random.randint(0, 360), seconds=random.randint(0, 86400))
            customers.append((fn, ln, email, city, created_at.strftime("%Y-%m-%d %H:%M:%S")))

        # Bulk insert in batches of 1,000
        batch_size = 1000
        for i in range(0, len(customers), batch_size):
            batch = customers[i:i + batch_size]
            cursor.executemany(
                "INSERT INTO dbo.Customer (first_name, last_name, email, city, created_at) VALUES (%s, %s, %s, %s, %s);",
                batch,
            )
        conn.commit()
        print("[OK] 10,000 Customers inserted.")

        # Get customer_id range
        cursor.execute("SELECT MIN(customer_id), MAX(customer_id) FROM dbo.Customer;")
        min_cid, max_cid = cursor.fetchone()

        # ---------------------------------------------------------------------
        # 2. Insert 25,000 Invoices
        # ---------------------------------------------------------------------
        print("Generating 25,000 invoices...")
        invoices = []
        base_inv_date = datetime(2023, 1, 1)

        for i in range(1, 25001):
            cid = random.randint(min_cid, max_cid)
            inv_date = base_inv_date + timedelta(days=random.randint(0, 30))
            # Amounts realistic for financial payments
            amount = round(random.expovariate(1 / 450) + 15.0, 2)
            if amount > 50000.0:
                amount = 49999.99
            status = random.choice(STATUSES)
            invoices.append((cid, inv_date.strftime("%Y-%m-%d"), amount, status))

        for i in range(0, len(invoices), batch_size):
            batch = invoices[i:i + batch_size]
            cursor.executemany(
                "INSERT INTO dbo.Invoice (customer_id, invoice_date, amount, status) VALUES (%s, %s, %s, %s);",
                batch,
            )
        conn.commit()
        print("[OK] 25,000 Invoices inserted.")

        # ---------------------------------------------------------------------
        # 3. Insert Payments for Invoices
        # ---------------------------------------------------------------------
        print("Generating payments for invoices...")
        cursor.execute("SELECT invoice_id, invoice_date, amount, status FROM dbo.Invoice;")
        inv_rows = cursor.fetchall()

        payments = []
        for i_id, i_date, i_amt, status in inv_rows:
            if status == "PAID":
                # Paid invoices get 1 full payment within 0-3 days
                p_date = datetime.strptime(str(i_date), "%Y-%m-%d") + timedelta(days=random.randint(0, 3), hours=random.randint(8, 20))
                method = random.choice(PAYMENT_METHODS)
                payments.append((i_id, p_date.strftime("%Y-%m-%d %H:%M:%S"), float(i_amt), method))
            elif status == "OVERDUE" and random.random() < 0.3:
                # Some overdue have a partial payment
                p_date = datetime.strptime(str(i_date), "%Y-%m-%d") + timedelta(days=random.randint(15, 25))
                method = random.choice(PAYMENT_METHODS)
                payments.append((i_id, p_date.strftime("%Y-%m-%d %H:%M:%S"), round(float(i_amt) * 0.5, 2), method))

        for i in range(0, len(payments), batch_size):
            batch = payments[i:i + batch_size]
            cursor.executemany(
                "INSERT INTO dbo.Payment (invoice_id, payment_date, amount, payment_method) VALUES (%s, %s, %s, %s);",
                batch,
            )
        conn.commit()
        print(f"[OK] {len(payments)} Payments inserted.")

        # Verify summary
        cursor.execute("SELECT COUNT(*) FROM dbo.Customer;")
        c_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM dbo.Invoice;")
        i_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM dbo.Payment;")
        p_count = cursor.fetchone()[0]

        print("\n================== Verification ==================")
        print(f"dbo.Customer : {c_count:,} rows")
        print(f"dbo.Invoice  : {i_count:,} rows")
        print(f"dbo.Payment  : {p_count:,} rows")
        print("==================================================")

    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
