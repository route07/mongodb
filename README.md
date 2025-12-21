# MongoDB Docker Setup

A simple Docker Compose setup for MongoDB with TLS encryption and Mongo Express admin UI.

## Prerequisites

- Docker and Docker Compose installed
- OpenSSL (for generating TLS certificates)

## Quick Start

### 1. Generate TLS Certificates

```bash
./generate-tls-certs.sh
```

This creates the required TLS certificates in the `tls-certs/` directory.

### 2. Configure Environment Variables

Edit the `.env` file with your desired credentials:

```bash
# Mongo DB
MONGO_INITDB_ROOT_USERNAME=rbdbuser
MONGO_INITDB_ROOT_PASSWORD=your_password_here
MONGO_PORT=27017

# Mongo Express
ME_CONFIG_MONGODB_ADMINUSERNAME=rbdbuser
ME_CONFIG_MONGODB_ADMINPASSWORD=your_password_here
ME_CONFIG_MONGODB_SERVER=mongo-survey
ME_CONFIG_MONGODB_PORT=27017
ME_CONFIG_BASICAUTH_USERNAME=adminu
ME_CONFIG_BASICAUTH_PASSWORD=adminPassword
MONGO_EXPRESS_PORT=8992
```

### 3. Start Services

```bash
docker-compose up -d
```

### 4. Access Services

- **MongoDB**: `localhost:27017` (requires TLS)
- **Mongo Express UI**: `http://localhost:8992`

## Connection String

Connect to MongoDB using TLS:

```bash
mongosh "mongodb://your_username:your_password@localhost:27017/?tls=true&tlsCAFile=./tls-certs/ca.crt"
```

## Services

- **mongo-survey**: MongoDB 7.0 instance with TLS encryption
- **mongo-express-survey**: Web-based MongoDB admin interface

## Stop Services

```bash
docker-compose down
```

To remove volumes (database data):

```bash
docker-compose down -v
```

## Notes

- TLS certificates are stored in `tls-certs/` directory
- Database data is persisted in `db_data/` directory
- All configuration values are managed via `.env` file
