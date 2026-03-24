# API Architecture

This directory contains the API client and service layer following best practices for maintainable and scalable code.

## Structure

```
lib/api/
├── axiosClient.ts          # Axios instance with interceptors
├── auth.ts                 # Authentication functions and token management
└── services/
    ├── index.ts            # Centralized service exports
    ├── clientsService.ts   # Client CRUD operations
    ├── contactsService.ts  # Contact CRUD operations
    ├── addressesService.ts # Address CRUD operations
    └── authService.ts      # Authentication API calls
```

## Features

- **Axios-based**: All API calls use Axios for better error handling and interceptors
- **Centralized Error Handling**: FastAPI validation errors are automatically parsed
- **401 Handling**: Automatic logout on unauthorized responses
- **Type Safety**: Full TypeScript support with proper interfaces
- **Service Layer**: Clean separation between API calls and business logic

## Usage

```typescript
import { fetchClients, createClient } from '@/lib/api/services/clientsService';
import { createContact } from '@/lib/api/services/contactsService';

// Use in Redux thunks or components
const clients = await fetchClients();
const newClient = await createClient(clientData);
```

## Error Handling

All services automatically parse FastAPI validation errors and return user-friendly messages:

```typescript
try {
  await createClient(data);
} catch (error) {
  // Error message is already parsed and user-friendly
  console.error(error.message);
}
```
