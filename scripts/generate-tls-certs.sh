#!/bin/bash

# Script to generate TLS certificates for MongoDB
# This creates self-signed certificates suitable for development/testing
# For production, use certificates from a trusted CA

set -e

CERT_DIR="./tls-certs"
mkdir -p "$CERT_DIR"

echo "Generating TLS certificates for MongoDB..."

# Generate CA private key
openssl genrsa -out "$CERT_DIR/ca.key" 4096

# Generate CA certificate
openssl req -new -x509 -days 3650 -key "$CERT_DIR/ca.key" -out "$CERT_DIR/ca.crt" \
  -subj "/CN=MongoDB-CA/O=MongoDB"

# Generate server private key
openssl genrsa -out "$CERT_DIR/server.key" 4096

# Generate server certificate signing request
openssl req -new -key "$CERT_DIR/server.key" -out "$CERT_DIR/server.csr" \
  -subj "/CN=mongodb/O=MongoDB"

# Create server certificate extensions file
cat > "$CERT_DIR/server.ext" <<EOF
subjectAltName = @alt_names
[alt_names]
DNS.1 = mongodb
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF

# Generate server certificate signed by CA
openssl x509 -req -in "$CERT_DIR/server.csr" -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" \
  -CAcreateserial -out "$CERT_DIR/server.crt" -days 365 \
  -extfile "$CERT_DIR/server.ext"

# Combine server certificate and key for MongoDB (PEM format)
# MongoDB requires --tlsCertificateKeyFile to contain both cert and key
cat "$CERT_DIR/server.crt" "$CERT_DIR/server.key" > "$CERT_DIR/server.pem"

# Generate client certificate for mongo-express (optional, for client authentication)
openssl genrsa -out "$CERT_DIR/client.key" 4096
openssl req -new -key "$CERT_DIR/client.key" -out "$CERT_DIR/client.csr" \
  -subj "/CN=mongo-express/O=MongoDB"
openssl x509 -req -in "$CERT_DIR/client.csr" -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" \
  -CAcreateserial -out "$CERT_DIR/client.crt" -days 365

# Combine client certificate and key for mongo-express (PEM format)
cat "$CERT_DIR/client.crt" "$CERT_DIR/client.key" > "$CERT_DIR/client.pem"

# Set proper permissions
# server.pem needs to be readable by MongoDB user (UID 999) in container
chmod 644 "$CERT_DIR"/server.pem
chmod 600 "$CERT_DIR"/*.key
chmod 644 "$CERT_DIR"/*.crt
# client.pem can remain more restrictive if not used
chmod 600 "$CERT_DIR"/client.pem 2>/dev/null || true

# Clean up temporary files
rm -f "$CERT_DIR"/*.csr "$CERT_DIR"/*.ext "$CERT_DIR"/*.srl

echo "✓ TLS certificates generated successfully in $CERT_DIR/"
echo ""
echo "Generated files:"
echo "  - ca.crt: CA certificate"
echo "  - server.crt: Server certificate"
echo "  - server.key: Server private key"
echo "  - server.pem: Combined server certificate and key (used by MongoDB)"
echo "  - client.crt: Client certificate"
echo "  - client.key: Client private key"
echo "  - client.pem: Combined client certificate and key"
echo ""
echo "Note: These are self-signed certificates for development."
echo "For production, use certificates from a trusted Certificate Authority."
