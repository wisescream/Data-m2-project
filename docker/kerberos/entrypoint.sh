#!/bin/bash
set -e

if [ ! -f /var/lib/krb5kdc/principal ]; then
  echo "Initializing MIT Kerberos KDC database for realm FINLAKE.INTERNAL..."
  kdb5_util create -s -P FinLakeKDC2026!
  echo "*/admin@FINLAKE.INTERNAL *" > /var/lib/krb5kdc/kadm5.acl
  kadmin.local -q "addprinc -pw FinLake2026! finlake/admin"
  kadmin.local -q "addprinc -pw FinLake2026! trino/finlake-trino"
  kadmin.local -q "addprinc -pw FinLake2026! sqlserver/finlake-sqlserver"
fi

echo "Starting kadmind and krb5kdc..."
kadmind -nofork &
exec krb5kdc -n
