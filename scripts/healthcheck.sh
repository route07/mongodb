#!/bin/bash
# MongoDB healthcheck script
set -e

# First check if mongod process is running
if ! pgrep -x mongod > /dev/null; then
  exit 1
fi

# Try to connect with mongosh using TLS
mongosh --tls \
  --tlsAllowInvalidCertificates \
  --tlsCAFile /etc/mongo/ssl/ca.crt \
  -u "${MONGO_INITDB_ROOT_USERNAME}" \
  -p "${MONGO_INITDB_ROOT_PASSWORD}" \
  --authenticationDatabase admin \
  --eval "db.adminCommand('ping')" \
  --quiet \
  > /dev/null 2>&1
