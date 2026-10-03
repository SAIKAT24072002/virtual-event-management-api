# Virtual Event Management API

A secure, deployment-ready REST API for managing virtual events. Organizers can create and manage their own events and participant lists; attendees can browse events and manage their registrations. Data is intentionally stored in memory for this assignment.

## Features

- Account registration and login with bcrypt password hashing and expiring JWTs
- Organizer/attendee authorization and event ownership enforcement
- Event CRUD with strict UTC date/time validation
- Attendee registration, cancellation, personal registration list, and organizer participant management
- Welcome and event-confirmation email through Nodemailer
- Explicit local email preview mode; registration remains saved if notification delivery fails
- Helmet, configurable CORS, authentication rate limiting, request-size limits, and safe errors
- Swagger UI at `/docs`, OpenAPI JSON at `/openapi.json`, health check, Postman collection
- Jest/Supertest integration tests with an isolated in-memory store

## Technology

Node.js, Express, JavaScript, bcrypt, JSON Web Token, Nodemailer, Helmet, CORS, express-rate-limit, Swagger UI, Jest, and Supertest.

## Prerequisites

- Node.js 18 or newer
- npm

## Install and run locally

```bash
npm install
cp .env.example .env
# Replace JWT_SECRET in .env with a long random value
npm start
```

For automatic restart during development:

```bash
npm run dev
```

The default URL is `http://localhost:3000`; interactive documentation is at `http://localhost:3000/docs`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port; defaults to `3000` |
| `JWT_SECRET` | Yes | Secret used to sign and verify JWTs; there is no fallback |
| `JWT_EXPIRES_IN` | No | JWT lifetime accepted by `jsonwebtoken`; defaults to `1h` |
| `CORS_ORIGIN` | No | `*` or a comma-separated origin allow-list; defaults to `*` |
| `EMAIL_MODE` | No locally | `preview` for clearly labelled console previews or `smtp` for delivery |
| `EMAIL_FROM` | SMTP | Sender address |
| `SMTP_HOST` | Production/SMTP | SMTP server hostname |
| `SMTP_PORT` | Production/SMTP | SMTP port, commonly `587` or `465` |
| `SMTP_SECURE` | No | `true` for implicit TLS, otherwise `false` |
| `SMTP_USER` | Production/SMTP | SMTP username |
| `SMTP_PASS` | Production/SMTP | SMTP password |

In local development, missing SMTP settings select preview mode. Preview output is explicitly marked and the API returns `notification.status: "preview"`; it is not presented as delivery. In production, all SMTP settings are required and incomplete configuration stops startup with a clear error. Never commit `.env`.

## Test

```bash
npm run test
```

Tests mock the email service and make no real SMTP calls. Every test resets the in-memory maps.

## Roles and access rules

Registration accepts `organizer` or `attendee`; omitted role defaults to `attendee`. This assignment intentionally permits users to choose either role during account registration.

- Both roles can list events and view event details.
- Only organizers can create events.
- Only the organizer who created an event can update/delete it or list/remove its participants.
- Only attendees can register, cancel, and list their own registrations.
- JWT middleware reloads the user from the store and authorizes using the current stored role.

Use a token on protected routes:

```http
Authorization: Bearer <token>
```

## API endpoints

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| GET | `/` | Public | API name, status, and documentation path |
| GET | `/health` | Public | Health check |
| GET | `/docs` | Public | Swagger UI |
| GET | `/openapi.json` | Public | OpenAPI document |
| POST | `/register` | Public (rate limited) | Create an account |
| POST | `/login` | Public (rate limited) | Authenticate and receive a JWT |
| GET | `/me` | Authenticated | Current safe user profile |
| GET | `/me/registrations` | Attendee | Current attendee's registered events |
| GET | `/events` | Authenticated | List events |
| GET | `/events/:id` | Authenticated | Event details |
| POST | `/events` | Organizer | Create an event |
| PUT | `/events/:id` | Owner organizer | Completely replace editable fields |
| DELETE | `/events/:id` | Owner organizer | Delete an event |
| POST | `/events/:id/register` | Attendee | Register for a future event |
| DELETE | `/events/:id/register` | Attendee | Cancel own registration |
| GET | `/events/:id/participants` | Owner organizer | List safe participant profiles |
| DELETE | `/events/:id/participants/:userId` | Owner organizer | Remove a participant |

All success responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": { "message": ... } }`.

## Examples

Register (the email is trimmed/lowercased and the password is never returned):

```http
POST /register
Content-Type: application/json

{"name":"Asha Roy","email":"asha@example.com","password":"strongpass123","role":"organizer"}
```

```json
{"success":true,"data":{"user":{"id":"...","name":"Asha Roy","role":"organizer","createdAt":"...","email":"asha@example.com"},"notification":{"status":"preview","message":"Email was previewed locally and not delivered"}}}
```

Login:

```http
POST /login
Content-Type: application/json

{"email":"asha@example.com","password":"strongpass123"}
```

```json
{"success":true,"data":{"token":"<jwt>","expiresIn":"1h","user":{"id":"...","name":"Asha Roy","role":"organizer","createdAt":"...","email":"asha@example.com"}}}
```

Create an event (all schedule values are **UTC**):

```http
POST /events
Authorization: Bearer <token>
Content-Type: application/json

{"title":"Node.js Summit","description":"Practical backend sessions.","date":"2099-08-20","time":"14:30"}
```

```json
{"success":true,"data":{"event":{"id":"...","title":"Node.js Summit","description":"Practical backend sessions.","date":"2099-08-20","time":"14:30","organizerId":"...","participantCount":0,"createdAt":"...","updatedAt":"..."}}}
```

`PUT /events/:id` uses complete replacement semantics for the four editable fields, so `title`, `description`, `date`, and `time` are all required. `id`, `organizerId`, `participants`, and timestamps cannot be supplied by clients; ownership and existing registrations are preserved.

```http
PUT /events/<id>
Authorization: Bearer <organizer-token>
Content-Type: application/json

{"title":"Updated Summit","description":"Updated agenda.","date":"2099-08-21","time":"10:00"}
```

Register for an event:

```http
POST /events/<id>/register
Authorization: Bearer <attendee-token>
```

```json
{"success":true,"data":{"event":{"id":"...","title":"Updated Summit","description":"Updated agenda.","date":"2099-08-21","time":"10:00","organizerId":"...","participantCount":1,"createdAt":"...","updatedAt":"..."},"notification":{"status":"sent"}}}
```

## Schedule and storage notes

Dates use `YYYY-MM-DD`, times use 24-hour `HH:mm`, and both represent **UTC**. Invalid calendar dates/times and past schedules are rejected for creation, schedule replacement, and registration.

Users and events live only in this process's memory. All data is lost whenever the server restarts or redeploys. Multiple application instances do not share data, so deploy one instance for this assignment.

## Deployment with Render

The included `render.yaml` defines a free Node web service, `npm ci`, `npm start`, `/health`, and a generated JWT secret.

1. Push this repository to GitHub.
2. In Render, choose **New > Blueprint** and select the repository.
3. Enter real values for `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS` when prompted.
4. Deploy, then verify `https://<service-host>/health` and `https://<service-host>/docs`.
5. Run the register → login → create event → attendee registration flow against the HTTPS URL.

No repository or deployment URL is claimed here until it has actually been created and verified.

## Postman

Import [`postman/Virtual Event Management API.postman_collection.json`](postman/Virtual%20Event%20Management%20API.postman_collection.json). Set `baseUrl` (defaults to local), run organizer registration/login, then copy the returned token into `organizerToken`. Do the same for `attendeeToken`; after creating an event, set `eventId`.
