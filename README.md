# ScholarStream-Server

ScholarStream-Server serves as the backend for managing scholarships, applications, users, and related functionalities. This is the core server that facilitates data flow, authorization, and integration with databases and external services.

## Table of Contents
- [Features](#features)
- [Technologies Used](#technologies-used)
- [Environment Setup](#environment-setup)
- [Endpoints Overview](#endpoints-overview)
- [Security & Authorization](#security--authorization)
- [Contributing](#contributing)
- [License](#license)

---

## Features

ScholarStream-Server provides the following functionalities:
- **User Management**: 
  - Create, fetch, and delete users
  - Assign roles such as Admin, Moderator, and User
- **Scholarship Management**:
  - Create, update, delete and fetch scholarships
  - Get top scholarships, scholarships by categories, and country
- **Applications**:
  - Apply for scholarships, payment handling, and manage applications
  - Get applications based on user or moderator roles
- **Reviews**:
  - Add, fetch, update, and delete reviews for scholarships
- **Payment Management**:
  - Stripe payment gateways for handling application fees

---

## Technologies Used

It leverages the following technologies:
- **Node.js**: Core server runtime environment
- **Express.js**: Web framework used to build RESTful APIs
- **MongoDB**: NoSQL database to manage scholarship and user data
- **Firebase Admin**: Firebase SDK for user verification and authentication
- **Stripe**: Payment processing for managing application fees
- **dotenv**: To manage environment variables securely

---

## Environment Setup

### Prerequisites
Ensure that you have the following tools installed:
- Node.js
- MongoDB
- Firebase Admin SDK (with service account)
- A working Stripe account for payments

### Installation and Configuration
1. Clone the repository:
   ```bash
   git clone https://github.com/Rakibislam22/ScholarStream-Server.git
   cd ScholarStream-Server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and set:
   ```
   PORT=3000
   URI=your-mongoDB-uri
   SITE_DOMAIN=https://localhost:3000
   STRIPE_SECRET_KEY=your-stripe-secret-key
   FB_SDK_BASE64=your-firebase-sdk-base64-credentials
   ```

4. Start the server:
   ```bash
   npm start
   ```

---

## Endpoints Overview

Here are the key endpoints provided:

### User Management
- `POST /users`: Create a new user
- `GET /users`: Get all users
- `GET /users/:email/role`: Get user role by email
- `DELETE /users/:id`: Delete a user

### Scholarship Management
- `GET /scholarships`: Fetch scholarships
- `GET /scholarship/:id`: Fetch scholarship by ID
- `POST /add-scholarship`: Add a new scholarship
- `PATCH /scholarship/:id`: Update a scholarship
- `DELETE /scholarship/:id`: Delete a scholarship

### Reviews
- `POST /reviews`: Add a review to scholarship
- `GET /my-reviews?email=userEmail`: Fetch reviews by a user
- `DELETE /reviews/:id`: Delete a specific review

### Applications
- `POST /applications`: Submit an application
- `GET /moderator/applications`: View all applications (Moderator-level access)
- `PATCH /applications/feedback/:id`: Update application feedback

### Payment Processing
- `POST /create-payment-intent`: Stripe payment integration for fees
- `PATCH /applications/payment/:id`: Update payment status of an application

---

## Security & Authorization

- **Firebase Token Verification**: User authentication is verified through Firebase tokens.
- **Role-Based Authorization**: 
  - Admin: Manage all content and roles.
  - Moderator: Manage submissions (Applications & Feedbacks).
  - User: Submit and manage their data seamlessly.

---

## Contributing

Contributions are welcome! Feel free to fork the repository and create pull requests. We encourage discussions around improvements and bug fixes.

---

## License

The ScholarStream-Server project is licensed under the [MIT License](LICENSE).