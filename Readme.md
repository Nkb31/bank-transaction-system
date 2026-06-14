# Bank Transaction System

A backend banking application built using Node.js, Express.js, and MongoDB.

## Features
- User Authentication (JWT)
- Account Management
- Money Transfer
- Transaction History
- Secure APIs

## Tech Stack
- Node.js
- Express.js
- MongoDB
- JWT
- bcrypt

## Installation

### Clone the Repository

```bash
git clone https://github.com/Nkb31/bank-transaction-system.git
cd bank-transaction-system
```

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Create a `.env` file:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
```

### Run the Server

```bash
npm start
```
## API Endpoints

### Authentication
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout

### Accounts
POST /api/accounts
GET /api/accounts
GET /api/accounts/balance/:accountId

### Transactions
POST /api/transactions
POST /api/transactions/system/initial-funds
