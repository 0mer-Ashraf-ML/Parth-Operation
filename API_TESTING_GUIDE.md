# API Testing Guide – Complete Roman Urdu

> **Base URL:** `http://127.0.0.1:8000`
> **Swagger UI:** `http://127.0.0.1:8000/docs`

---

## SECTION 1: Server Start Karna or Test Users Banana

### Step 1 – Server Start Karo

Terminal kholo aur ye commands run karo:

```
cd C:\Users\HP\Desktop\Parth-Operation
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --port 8000
```

Server start hone ke baad Swagger UI kholo: **http://127.0.0.1:8000/docs**

### Step 2 – Test Users Banana (Sirf Pehli Baar)

Ek **nayi terminal** kholo (pehle wali band mat karo) aur ye run karo:

```
cd C:\Users\HP\Desktop\Parth-Operation
.\.venv\Scripts\Activate.ps1
python -m scripts.seed_admin
python -m scripts.seed_test_users
```

Ye 3 users bana dega:

| Role | Email | Password | Special Info |
|------|-------|----------|-------------|
| **Admin** | `admin@gmail.com` | `admin123` | Full access – sab kuch dekh/edit kar sakta hai |
| **Account Manager (AM)** | `am@gmail.com` | `am123` | Sirf assigned clients dikh sakty hain (TestClient LLC) |
| **Vendor** | `vendor@gmail.com` | `vendor123` | Sirf apna vendor record dikh sakta hai (TestVendor Corp) |

Seed script ye bhi banata hai:
- **"TestVendor Corp"** – ek vendor record (vendor user isse linked hai)
- **"TestClient LLC"** – ek client record (AM user ko ye assigned hai)
- **ClientAssignment** – AM ko TestClient LLC se jodta hai

---

## SECTION 2: Login Kaise Karna Hai (Teeno Roles)

### Swagger UI me Login ka Tareeqa

1. Browser me kholo: **http://127.0.0.1:8000/docs**
2. **POST /auth/login** endpoint dhundo aur click karo
3. **"Try it out"** button dbaao
4. Request body me ye likho:

**ADMIN Login:**
```json
{
  "email": "admin@gmail.com",
  "password": "admin123"
}
```

**AM Login:**
```json
{
  "email": "am@gmail.com",
  "password": "am123"
}
```

**VENDOR Login:**
```json
{
  "email": "vendor@gmail.com",
  "password": "vendor123"
}
```

5. **"Execute"** button dbaao
6. Response me `access_token` aayega – **isko copy karo**

Response kaisa dikhta hai:
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "expires_in_minutes": 480,
    "user": {
      "id": 1,
      "email": "admin@gmail.com",
      "full_name": "System Admin",
      "role": "admin",
      "vendor_id": null,
      "client_ids": []
    }
  }
}
```

**ZAROORI:** AM ka response dekhna – `client_ids` me assigned client ka id hoga:
```json
"client_ids": [5]
```

**Vendor ka response dekhna – `vendor_id` me linked vendor ka id hoga:**
```json
"vendor_id": 4
```

### Token Swagger UI me Set Karna (Authorize)

1. Swagger page ke **top-right** me **"Authorize"** button (lock icon 🔒) pe click karo
2. "Value" field me **sirf token paste karo** (Bearer mat likho, sirf token)
3. **"Authorize"** button dbaao, phir **"Close"** dbaao
4. Ab sare endpoints automatically authenticated ho jayenge

> **IMPORTANT:** Jab bhi alag role test karna ho, pehle `/auth/login` se naya token lo, phir Authorize me purana hata ke naya paste karo.

---

## SECTION 3: AUTH APIs Test Karna

### 3.1 — POST /auth/login (Login Karna)

**Kya karta hai:** Email aur password se login karta hai. JWT token deta hai response me.

**Teeno roles ke liye kaam karta hai.**

| Test Case | Body | Expected Result |
|-----------|------|-----------------|
| Admin login | `{"email":"admin@gmail.com","password":"admin123"}` | ✅ Token milega, role="admin", client_ids=[] |
| AM login | `{"email":"am@gmail.com","password":"am123"}` | ✅ Token milega, role="account_manager", client_ids me assigned client IDs honge |
| Vendor login | `{"email":"vendor@gmail.com","password":"vendor123"}` | ✅ Token milega, role="vendor", vendor_id hoga |
| Galat password | `{"email":"admin@gmail.com","password":"wrongpass"}` | ❌ 401 Error: "Invalid email or password" |
| Galat email | `{"email":"nahi@gmail.com","password":"admin123"}` | ❌ 401 Error: "Invalid email or password" |

**Kya check karna hai:**
- Admin ke response me `client_ids` khali honi chahiye `[]` aur `vendor_id` null hona chahiye
- AM ke response me `client_ids` me uske assigned clients ke IDs hone chahiye
- Vendor ke response me `vendor_id` me uska linked vendor ka ID hona chahiye

---

### 3.2 — POST /auth/refresh (Token Refresh Karna)

**Kya karta hai:** Purana valid token le ke naya fresh token deta hai. Database se latest permissions (client assignments) re-read karta hai.

**Pehle:** Authorize me valid token set karo (kisi bhi role ka)

1. **POST /auth/refresh** pe jao
2. "Try it out" dbaao
3. Body kuch nahi chahiye – sirf "Execute" dbaao

| Test Case | Expected Result |
|-----------|-----------------|
| Valid token ke sath | ✅ Naya token milega latest permissions ke sath |
| Bina token ke | ❌ 401 Error: "Missing authorization header" |
| Expired/invalid token ke sath | ❌ 401 Error: "Invalid or expired token" |

**Kab useful hai:** Jab Admin ne AM ko nayi client assign ki ho, toh AM `/auth/refresh` call karke naya token le sakta hai jisme updated `client_ids` hongi.

---

### 3.3 — GET /auth/me (Apni Info Dekhna)

**Kya karta hai:** JWT token se current user ki info nikaal ke dikhata hai. Ye frontend ke liye useful hai taake pata chale kaun logged in hai.

**Pehle:** Authorize me valid token set karo

1. **GET /auth/me** pe jao
2. "Try it out" → "Execute" dbaao

| Role | Expected Response |
|------|-------------------|
| Admin | `user_id`, `role: "admin"`, `client_ids: []`, `vendor_id: null`, `email`, `full_name` |
| AM | `user_id`, `role: "account_manager"`, `client_ids: [5, ...]`, `vendor_id: null`, `email`, `full_name` |
| Vendor | `user_id`, `role: "vendor"`, `client_ids: []`, `vendor_id: 4`, `email`, `full_name` |

**Kya check karna hai:**
- Har role ke liye sahi info aa rahi hai ya nahi
- AM ke `client_ids` me sahi client IDs hain ya nahi
- Vendor ke `vendor_id` me sahi vendor ka ID hai ya nahi

---

## SECTION 4: CLIENT APIs Test Karna

> **Permission Rule:** Clients SIRF Admin aur AM dekh sakty hain. Vendor ko bilkul access nahi hai clients pe. Admin sab kuch kar sakta hai. AM SIRF apne assigned clients dekh sakta hai, create/update/delete nahi kar sakta.

### 4.1 — POST /clients (Nayi Client Banana)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

**Pehle:** Admin ka token Authorize me set karo

1. **POST /clients** pe jao
2. "Try it out" dbaao
3. Ye body likho:

```json
{
  "company_name": "Charles Industries, LLC",
  "payment_terms": 30,
  "tax_percentage": 8.25,
  "discount_percentage": 5.00,
  "auto_invoice": false,
  "notes": "Premium client - Net 30 terms",
  "contacts": [
    {
      "contact_type": "main",
      "name": "John Smith",
      "email": "john@charles.com",
      "phone": "+1-555-0101"
    },
    {
      "contact_type": "accounting",
      "name": "Jane Doe",
      "email": "billing@charles.com",
      "phone": "+1-555-0102"
    }
  ],
  "addresses": [
    {
      "label": "Schaumburg HQ",
      "address_line_1": "1350 E Algonquin Rd",
      "address_line_2": "Suite 200",
      "city": "Schaumburg",
      "state": "IL",
      "zip_code": "60196",
      "country": "US",
      "is_default": true
    },
    {
      "label": "Canton Warehouse",
      "address_line_1": "4700 Mega St",
      "city": "Canton",
      "state": "OH",
      "zip_code": "44720",
      "country": "US",
      "is_default": false
    }
  ]
}
```

4. "Execute" dbaao

**Expected:** ✅ 201 status – client ban jayegi with contacts aur addresses nested

**Response me kya check karna hai:**
- `id` assign hoga (e.g. 6)
- `company_name` sahi hoga
- `contacts` array me 2 contacts honge (main aur accounting)
- `addresses` array me 2 addresses hongi (Schaumburg HQ default hoga)
- `is_active` true hoga
- `created_at` aur `updated_at` timestamps honge

**Ek aur client banao** (baad me AM ke liye test karne ke liye):
```json
{
  "company_name": "ABC Corporation",
  "payment_terms": 45,
  "notes": "This client is NOT assigned to AM"
}
```

> **IMPORTANT:** Ye doosri client AM ko assigned NAHI hai, toh AM ko ye dikhni nahi chahiye.

**Permission Test Karo:**

| Role | Action | Expected |
|------|--------|----------|
| Admin token se | POST /clients | ✅ 201 – Client ban jayegi |
| AM token se | POST /clients | ❌ 403 Error: "This action requires one of the following roles: admin" |
| Vendor token se | POST /clients | ❌ 403 Error: "This action requires one of the following roles: admin" |

---

### 4.2 — GET /clients (Sab Clients ki List)

**Permission:** ✅ Admin (sab) | ✅ AM (sirf assigned) | ❌ Vendor

**Pehle:** Token set karo (har role ke sath test karo)

1. **GET /clients** pe jao
2. "Try it out" → "Execute" dbaao

**Admin ke sath test:**
- **Expected:** ✅ Sab clients ki list aayegi (TestClient LLC, Charles Industries, ABC Corporation, etc.)
- Saari clients dikhni chahiye chahe kitni bhi hon

**AM ke sath test:**
- Pehle AM ka token set karo (Authorize → purana hatao → AM ka token paste karo)
- **Expected:** ✅ SIRF "TestClient LLC" dikhegi (kyunki sirf yahi assigned hai)
- "Charles Industries" ya "ABC Corporation" BILKUL nahi dikhni chahiye
- Ye sabse zaroori test hai – isse confirm hota hai ke DB-level scoping kaam kar rahi hai

**Vendor ke sath test:**
- Vendor ka token set karo
- **Expected:** ❌ 403 Error: "This action requires one of the following roles: admin, account_manager"

**Filters test karo (Admin token se):**

| Filter | URL | Expected |
|--------|-----|----------|
| Active clients | `GET /clients?is_active=true` | Sirf active clients |
| Search by name | `GET /clients?search=Charles` | Sirf "Charles Industries, LLC" |
| Inactive clients | `GET /clients?is_active=false` | Koi bhi soft-deleted client |

Swagger UI me filters kaise lagane hain:
- "Try it out" dbaao
- `is_active` field me `true` ya `false` likho
- `search` field me company name ka koi hissa likho
- "Execute" dbaao

---

### 4.3 — GET /clients/{client_id} (Ek Client ki Detail)

**Permission:** ✅ Admin (koi bhi) | ✅ AM (sirf assigned) | ❌ Vendor

1. **GET /clients/{client_id}** pe jao
2. `client_id` me actual ID daalo (e.g. `5` ya jo bhi seed se mila)

**Admin ke sath:**
- Koi bhi `client_id` daalo → ✅ Client ki full detail aayegi contacts aur addresses ke sath

**AM ke sath:**

| Test | client_id | Expected |
|------|-----------|----------|
| Assigned client | TestClient LLC ka ID (e.g. 5) | ✅ Full detail dikhegi |
| Non-assigned client | Charles Industries ka ID (e.g. 6) | ❌ 403 Error: "You do not have access to this client" |
| Non-existing | `99999` | ❌ 404 Error: "Client with id=99999 not found" |

**Vendor ke sath:**
- **Expected:** ❌ 403 Error: roles wala

**Response me kya hota hai:**
```json
{
  "success": true,
  "data": {
    "id": 6,
    "company_name": "Charles Industries, LLC",
    "payment_terms": 30,
    "tax_percentage": "8.25",
    "discount_percentage": "5.00",
    "auto_invoice": false,
    "notes": "Premium client - Net 30 terms",
    "is_active": true,
    "created_at": "2026-03-10T...",
    "updated_at": "2026-03-10T...",
    "contacts": [
      {
        "id": 1,
        "client_id": 6,
        "contact_type": "main",
        "name": "John Smith",
        "email": "john@charles.com",
        "phone": "+1-555-0101"
      }
    ],
    "addresses": [
      {
        "id": 1,
        "client_id": 6,
        "label": "Schaumburg HQ",
        "address_line_1": "1350 E Algonquin Rd",
        "is_default": true
      }
    ]
  }
}
```

---

### 4.4 — PATCH /clients/{client_id} (Client Update Karna)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

**Pehle:** Admin ka token set karo

1. **PATCH /clients/{client_id}** pe jao
2. `client_id` daalo
3. **SIRF wohi fields bhejo jo change karne hain** (baqi chhod do):

```json
{
  "payment_terms": 45,
  "notes": "Updated: Net 45 terms negotiated"
}
```

**Expected:** ✅ Updated client ka full detail aayega response me

**Kya check karna hai:**
- `payment_terms` ab 45 hona chahiye
- `notes` updated hona chahiye
- Baqi sab fields (company_name, tax_percentage, etc.) same rehne chahiye – change nahi honi chahiye
- `updated_at` timestamp badal gaya hoga

**Permission Test:**

| Role | Expected |
|------|----------|
| Admin | ✅ Client update ho jayegi |
| AM | ❌ 403 Error |
| Vendor | ❌ 403 Error |

---

### 4.5 — DELETE /clients/{client_id} (Client Delete/Deactivate Karna)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

**ZAROORI:** Ye SOFT DELETE hai – record database se nahi mitti, sirf `is_active = false` ho jata hai.

1. **DELETE /clients/{client_id}** pe jao
2. Wo `client_id` daalo jise deactivate karna hai

**Expected:** ✅ `{"success": true, "data": {"message": "Client deactivated"}}`

**Verify karo:**
- `GET /clients/{client_id}` se dekho – `is_active` ab `false` hona chahiye
- `GET /clients?is_active=true` me ye client ab nahi dikhni chahiye
- `GET /clients?is_active=false` me ye client dikhni chahiye

---

### 4.6 — POST /clients/{client_id}/contacts (Contact Add Karna)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

1. **POST /clients/{client_id}/contacts** pe jao
2. `client_id` daalo
3. Body:

```json
{
  "contact_type": "secondary",
  "name": "Mike Johnson",
  "email": "mike@charles.com",
  "phone": "+1-555-0103"
}
```

**Expected:** ✅ 201 – Naya contact ban jayega

**contact_type ke 3 options hain:**
- `main` – Main contact person
- `secondary` – Extra contact
- `accounting` – Billing/accounting contact

---

### 4.7 — PATCH /clients/{client_id}/contacts/{contact_id} (Contact Update)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

1. **PATCH /clients/{client_id}/contacts/{contact_id}** pe jao
2. Dono IDs daalo
3. Body (sirf jo change karna hai):

```json
{
  "name": "Mike J. Updated",
  "phone": "+1-555-9999"
}
```

**Expected:** ✅ Updated contact aayega response me

---

### 4.8 — DELETE /clients/{client_id}/contacts/{contact_id} (Contact Delete)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

**Ye HARD DELETE hai** – record permanently mit jayega database se.

1. **DELETE /clients/{client_id}/contacts/{contact_id}** pe jao
2. Dono IDs daalo → "Execute"

**Expected:** ✅ `{"success": true, "data": {"message": "Contact deleted"}}`

---

### 4.9 — POST /clients/{client_id}/addresses (Address Add Karna)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

```json
{
  "label": "Nogales Distribution",
  "address_line_1": "789 Border Rd",
  "city": "Nogales",
  "state": "AZ",
  "zip_code": "85621",
  "country": "US",
  "is_default": false
}
```

**Expected:** ✅ 201 – Address ban jayegi

**Default Address Logic:**
- Agar `is_default: true` bhejo toh pehle se jo bhi default thi wo automatically `is_default: false` ho jayegi
- Ek time pe sirf ek address default ho sakti hai

Test karo: Address add karo with `is_default: true` → phir `GET /clients/{client_id}` se check karo ke purani default address ab `false` ho gayi

---

### 4.10 — PATCH /clients/{client_id}/addresses/{address_id} (Address Update)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

```json
{
  "label": "Updated Warehouse Label",
  "is_default": true
}
```

**Expected:** ✅ Address update ho jayegi. Agar `is_default: true` bhejo toh baaki addresses ka default hatt jayega.

---

### 4.11 — DELETE /clients/{client_id}/addresses/{address_id} (Address Delete)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

**HARD DELETE** – permanently hat jayegi.

**Expected:** ✅ `{"success": true, "data": {"message": "Address deleted"}}`

---

## SECTION 5: VENDOR APIs Test Karna

> **Permission Rule:** Admin full CRUD kar sakta hai. AM aur Vendor sirf list/detail dekh sakty hain. Vendor SIRF apna record dekh sakta hai.

### 5.1 — POST /vendors (Nayi Vendor Banana)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

**Admin ka token set karo:**

```json
{
  "company_name": "DPM Manufacturing",
  "contact_name": "David Chen",
  "email": "david@dpm.com",
  "phone": "+86-21-12345678"
}
```

**Expected:** ✅ 201 – Vendor ban jayega

**Duplicate check:** Agar same `company_name` se dobara banane ki koshish karo toh ❌ 409 Conflict Error aayega.

**Permission Test:**

| Role | Expected |
|------|----------|
| Admin | ✅ 201 – Vendor ban jayega |
| AM | ❌ 403 – "This action requires one of the following roles: admin" |
| Vendor | ❌ 403 – Same error |

---

### 5.2 — GET /vendors (Sab Vendors ki List)

**Permission:** ✅ Admin (sab) | ✅ AM (sab) | ✅ Vendor (sirf apna)

**Admin ke sath:**
- ✅ Saari vendors dikhni chahiye (TestVendor Corp, DPM Manufacturing, AppleCorp, etc.)

**AM ke sath:**
- ✅ Saari vendors dikhni chahiye (AM ko vendors ki list dekhna allowed hai – ye clients se different hai)

**Vendor ke sath:**
- ✅ **SIRF apna vendor record dikhega** – "TestVendor Corp"
- Baqi vendors (DPM Manufacturing, AppleCorp) nahi dikhni chahiye

**Ye sabse zaroori test hai Vendor role ke liye** – confirm karo ke Vendor ko sirf apna record dikhe

**Filters (Admin/AM token se):**

| Filter | URL | Expected |
|--------|-----|----------|
| Search | `GET /vendors?search=DPM` | Sirf "DPM Manufacturing" |
| Active only | `GET /vendors?is_active=true` | Active vendors |

---

### 5.3 — GET /vendors/{vendor_id} (Ek Vendor ki Detail)

**Permission:** ✅ Admin (koi bhi) | ✅ AM (koi bhi) | ✅ Vendor (sirf apna)

**Admin se:** Koi bhi `vendor_id` → ✅ Detail milegi

**AM se:** Koi bhi `vendor_id` → ✅ Detail milegi

**Vendor se:**

| Test | vendor_id | Expected |
|------|-----------|----------|
| Apna vendor | TestVendor Corp ka ID | ✅ Detail dikhegi |
| Doosra vendor | DPM ka ID | ❌ 403: "You can only view your own vendor record" |
| Non-existing | `99999` | ❌ 404: "Vendor with id=99999 not found" |

---

### 5.4 — PATCH /vendors/{vendor_id} (Vendor Update)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

```json
{
  "contact_name": "David Chen Updated",
  "phone": "+86-21-99999999"
}
```

**Expected:** ✅ Updated vendor detail

---

### 5.5 — DELETE /vendors/{vendor_id} (Vendor Deactivate)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

**SOFT DELETE** – `is_active = false` ho jayega

**Expected:** ✅ `{"success": true, "data": {"message": "Vendor deactivated"}}`

---

## SECTION 6: SKU APIs Test Karna

> **Permission Rule:** SKUs ko Admin, AM, aur Vendor teeno dekh sakty hain. Create/Update/Delete SIRF Admin kar sakta hai. Tier pricing aur vendor mapping bhi SIRF Admin.

### 6.1 — POST /skus (Nayi SKU Banana)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

**Admin ka token set karo:**

```json
{
  "sku_code": "80-003099-A",
  "name": "BOND BAR ASM U 10IN ATT",
  "description": "Bonding bar assembly for 10-inch units - AT&T spec",
  "default_vendor_id": null,
  "track_inventory": false,
  "inventory_count": 0,
  "tier_prices": [
    {
      "min_qty": 1,
      "max_qty": 999,
      "unit_price": 3.51
    },
    {
      "min_qty": 1000,
      "max_qty": 4999,
      "unit_price": 3.25
    },
    {
      "min_qty": 5000,
      "max_qty": null,
      "unit_price": 2.98
    }
  ]
}
```

**Expected:** ✅ 201 – SKU ban jayegi with tier prices nested

**Response me kya check karna hai:**
- `sku_code` unique hona chahiye – duplicate se ❌ 409 Error
- `tier_prices` array me 3 tiers honge
- Har tier me `min_qty`, `max_qty`, `unit_price` hoga
- Last tier me `max_qty: null` (unlimited – sabse upar wali tier)

**Tier Pricing ka concept:**
- Jab customer 500 units order kare → price $3.51/unit (1-999 tier)
- Jab customer 2000 units order kare → price $3.25/unit (1000-4999 tier)
- Jab customer 10000 units order kare → price $2.98/unit (5000+ tier)
- Ye automatically SO line creation ke waqt lock ho jayega

**Ek aur SKU banao (bina tier prices ke):**
```json
{
  "sku_code": "45-001234-B",
  "name": "FIBER SPLICE TRAY 24CT",
  "description": "24-count fiber splice tray",
  "track_inventory": true,
  "inventory_count": 150
}
```

**Permission Test:**

| Role | Expected |
|------|----------|
| Admin | ✅ 201 – SKU ban jayegi |
| AM | ❌ 403 Error |
| Vendor | ❌ 403 Error |

---

### 6.2 — GET /skus (Sab SKUs ki List)

**Permission:** ✅ Admin | ✅ AM | ✅ Vendor (teeno dekh sakty hain)

1. **GET /skus** → "Try it out" → "Execute"

**Expected:** ✅ Teeno roles ke liye sab SKUs ki list aayegi

**Filters:**

| Filter | URL | Expected |
|--------|-----|----------|
| Search by code | `GET /skus?search=80-003099` | Sirf matching SKU |
| Search by name | `GET /skus?search=BOND` | Sirf matching SKU |
| Filter by vendor | `GET /skus?vendor_id=1` | Sirf us vendor ki default SKUs |
| Active only | `GET /skus?is_active=true` | Active SKUs |

Swagger me: `search` field me likho `BOND` → Execute → sirf BOND BAR wali SKU aayegi

---

### 6.3 — GET /skus/{sku_id} (SKU ki Full Detail)

**Permission:** ✅ Admin | ✅ AM | ✅ Vendor

1. **GET /skus/{sku_id}** pe jao
2. `sku_id` daalo → Execute

**Response me kya hota hai:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "sku_code": "80-003099-A",
    "name": "BOND BAR ASM U 10IN ATT",
    "description": "Bonding bar assembly...",
    "default_vendor_id": null,
    "track_inventory": false,
    "inventory_count": 0,
    "is_active": true,
    "created_at": "...",
    "updated_at": "...",
    "tier_prices": [
      {"id": 1, "sku_id": 1, "min_qty": 1, "max_qty": 999, "unit_price": "3.51"},
      {"id": 2, "sku_id": 1, "min_qty": 1000, "max_qty": 4999, "unit_price": "3.25"},
      {"id": 3, "sku_id": 1, "min_qty": 5000, "max_qty": null, "unit_price": "2.98"}
    ],
    "sku_vendors": [
      {"id": 1, "sku_id": 1, "vendor_id": 4, "is_default": true, "vendor_name": "TestVendor Corp"}
    ]
  }
}
```

**Kya check karna hai:**
- `tier_prices` properly sorted hain ya nahi
- `sku_vendors` me linked vendors dikhte hain ya nahi with `vendor_name`

---

### 6.4 — PATCH /skus/{sku_id} (SKU Update)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

```json
{
  "name": "BOND BAR ASM U 10IN ATT - Updated",
  "track_inventory": true,
  "inventory_count": 500
}
```

**Expected:** ✅ Updated SKU detail – sirf jo fields bheje wo change honge, baqi same rahenge

**Unique code test:** Agar `sku_code` change karo aur wo kisi aur SKU ka already hai → ❌ 409 Conflict

---

### 6.5 — DELETE /skus/{sku_id} (SKU Deactivate)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

**SOFT DELETE** – `is_active = false`

**Expected:** ✅ `{"success": true, "data": {"message": "SKU deactivated"}}`

---

### 6.6 — POST /skus/{sku_id}/tiers (Tier Price Add Karna)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

Pehle se existing SKU me ek aur tier add karo:

```json
{
  "min_qty": 10000,
  "max_qty": null,
  "unit_price": 2.75
}
```

**Expected:** ✅ 201 – Naya tier price ban jayega

---

### 6.7 — PATCH /skus/{sku_id}/tiers/{tier_id} (Tier Price Update)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

```json
{
  "unit_price": 2.60
}
```

**Expected:** ✅ Tier price update ho jayega

**Galat tier_id ke sath:** ❌ 404: "Tier pricing with id=999 not found on SKU X"

---

### 6.8 — DELETE /skus/{sku_id}/tiers/{tier_id} (Tier Price Delete)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

**HARD DELETE** – tier permanently hat jayegi

---

### 6.9 — PUT /skus/{sku_id}/tiers (Saari Tier Prices Ek Sath Replace)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

**Ye purani saari tiers hata ke nayi set kar deta hai:**

```json
[
  {
    "min_qty": 1,
    "max_qty": 499,
    "unit_price": 4.00
  },
  {
    "min_qty": 500,
    "max_qty": null,
    "unit_price": 3.50
  }
]
```

**Expected:** ✅ Purani saari tiers delete ho jayengi aur nayi 2 ban jayengi

**Verify:** `GET /skus/{sku_id}` se dekho ke `tier_prices` me sirf nayi 2 tiers hain

---

### 6.10 — GET /skus/{sku_id}/vendors (SKU ke Linked Vendors)

**Permission:** ✅ Admin | ✅ AM | ✅ Vendor

1. **GET /skus/{sku_id}/vendors** pe jao
2. `sku_id` daalo → Execute

**Expected:** ✅ Us SKU se linked vendors ki list aayegi with `vendor_name`

---

### 6.11 — POST /skus/{sku_id}/vendors (Vendor ko SKU se Link Karna)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

```json
{
  "vendor_id": 4,
  "is_default": true
}
```

**Expected:** ✅ 201 – Vendor link ho jayega

**Kya hota hai:**
- `is_default: true` bhejne pe pehle se jo bhi default tha wo `false` ho jayega (ek time pe sirf ek default vendor)
- Same vendor ko dobara link karne pe → ❌ 409: "Vendor X is already linked to SKU Y"
- Non-existing vendor_id pe → ❌ 400: "Vendor with id=X not found"

---

### 6.12 — DELETE /skus/{sku_id}/vendors/{vendor_id} (Vendor ko SKU se Unlink)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

1. `sku_id` aur `vendor_id` daalo → Execute

**Expected:** ✅ `{"success": true, "data": {"message": "Vendor unlinked from SKU"}}`

---

## SECTION 7: HEALTH CHECK

### GET /health (System Status)

**Permission:** Koi bhi – authentication ki zaroorat NAHI

1. **GET /health** → Execute (bina token ke bhi kaam karega)

**Expected:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "0.1.0"
  }
}
```

---

## SECTION 8: SALES ORDER APIs Test Karna

> **Permission Rule:** Sales Orders SIRF Admin aur AM dekh/manage kar sakty hain. Vendor ko bilkul access NAHI hai SOs pe. Admin sab SO operations kar sakta hai. AM SIRF apne assigned clients ke SOs create/view/edit kar sakta hai. Delete SIRF Admin.

### 🔑 Sales Order ke Key Concepts (Samajhna Zaroori Hai)

**Sales Order kya hai?**
Jab customer email pe PDF (Purchase Order) bhejta hai, Account Manager us se data nikaal ke system me **Sales Order** banata hai. Ye order ka main record hai – invoicing, fulfillment, payments sab isi se tied hain.

**Tier Pricing Auto-Lock:**
- Jab SO line banate ho aur `unit_price` NAHI bhejte toh system **automatically** SKU ki tier pricing se price lock kar leta hai.
- Example: SKU "80-003099-A" ke tiers: 1-999 qty → $3.51, 1000-4999 → $3.25
- Agar ordered_qty=100 → price auto-lock $3.51
- Agar ordered_qty=2000 → price auto-lock $3.25
- Ye price lock hone ke baad KABHI change nahi hota (even if qty change karo)

**Status Derivation:**
SO ka status **kabhi manually set nahi hota** – ye HAMESHA line items se automatically calculate hota hai:
- **PENDING** → Koi bhi line me delivery nahi hui (delivered_qty = 0 for all)
- **PARTIAL_DELIVERED** → Kuch lines me delivery hui but sab complete nahi
- **DELIVERED** → Saari lines fully delivered (delivered_qty >= ordered_qty for all)

Abhi sirf PENDING status dikhega kyunki fulfillment events abhi implement nahi hue.

**Per-Line Due Dates:**
Har line item ka apna alag due_date ho sakta hai – customer ke PO me har SKU ki alag delivery date hoti hai.

---

### 8.1 — POST /sales-orders (Nayi Sales Order Banana)

**Permission:** ✅ Admin | ✅ AM (sirf assigned client) | ❌ Vendor

**Pehle:** Admin ya AM ka token Authorize me set karo

**ZAROORI:** SO banane se pehle ye hona chahiye:
- Client exist kare aur active ho
- SKUs exist karein aur active hon
- (Optional) Client address exist kare

**Admin se ek SO banao with lines:**

```json
{
  "order_number": "SO-2026-0001",
  "client_id": 3,
  "ship_to_address_id": 4,
  "order_date": "2026-03-10",
  "due_date": "2026-04-15",
  "notes": "Charles Industries - Q1 Order",
  "lines": [
    {
      "sku_id": 1,
      "ordered_qty": 100,
      "due_date": "2026-04-01"
    },
    {
      "sku_id": 2,
      "ordered_qty": 500,
      "unit_price": 5.50,
      "due_date": "2026-04-10"
    }
  ]
}
```

> **NOTE:** `client_id`, `sku_id`, `ship_to_address_id` ko apne actual IDs se replace karo. Pehle `GET /clients?is_active=true`, `GET /skus`, aur `GET /clients/{id}` se actual IDs check karo.

**Execute** dbaao

**Expected:** ✅ 201 status

**Response me kya check karna hai:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "order_number": "SO-2026-0001",
    "client_id": 3,
    "client_name": "Charles Industries, LLC",
    "ship_to_address_id": 4,
    "status": "pending",
    "order_date": "2026-03-10",
    "due_date": "2026-04-15",
    "notes": "Charles Industries - Q1 Order",
    "created_by": 1,
    "creator_name": "System Admin",
    "is_deletable": true,
    "lines": [
      {
        "id": 1,
        "line_number": 1,
        "sku_id": 1,
        "sku_code": "80-003099-A",
        "sku_name": "BOND BAR ASM U 10IN ATT",
        "ordered_qty": 100,
        "unit_price": "3.51",
        "due_date": "2026-04-01",
        "delivered_qty": 0,
        "invoiced_qty": 0,
        "remaining_qty": 100,
        "invoiceable_qty": 0
      },
      {
        "id": 2,
        "line_number": 2,
        "sku_id": 2,
        "sku_code": "45-001234-B",
        "sku_name": "FIBER SPLICE TRAY 24CT",
        "ordered_qty": 500,
        "unit_price": "5.50",
        "due_date": "2026-04-10",
        "delivered_qty": 0,
        "invoiced_qty": 0,
        "remaining_qty": 500,
        "invoiceable_qty": 0
      }
    ]
  }
}
```

**Kya check karna hai:**
- ✅ Line 1 me `unit_price: "3.51"` → **Tier pricing se auto-lock hua** (humne unit_price nahi bheja tha!)
- ✅ Line 2 me `unit_price: "5.50"` → **Humne explicitly bheja tha, wohi set hua**
- ✅ `status: "pending"` → Nayi SO hamesha PENDING hoti hai
- ✅ `is_deletable: true` → Abhi delete ho sakti hai (koi delivery nahi hui)
- ✅ `client_name` populated hai – denormalized for readability
- ✅ `creator_name` populated hai – kaun ne banai
- ✅ `remaining_qty = ordered_qty` (koi delivery nahi hui abhi)
- ✅ `invoiceable_qty = 0` (koi delivery nahi toh invoice bhi nahi)
- ✅ `line_number` auto-assigned (1, 2, 3...) agar hum ne nahi bheja

**Bina lines ke bhi SO ban sakti hai:**
```json
{
  "order_number": "SO-2026-0002",
  "client_id": 3,
  "notes": "Empty draft - lines will be added later"
}
```

**Tier Price Auto-Resolution ka test:**
- Agar SKU ki tier pricing configured hai aur tum `unit_price` NAHI bhejte → system automatically sahi tier se price utha lega
- Agar SKU ki tier pricing NAHI hai aur tum `unit_price` bhi nahi bhejte → ❌ 400 Error: "No tier pricing found for SKU..."
- Agar tum `unit_price` explicitly bhejte ho → wo USE hoga, tier pricing ignore hogi

**Permission Test:**

| Role | Action | Expected |
|------|--------|----------|
| Admin token se | POST /sales-orders (koi bhi active client) | ✅ 201 |
| AM token se | POST /sales-orders (assigned client ka id) | ✅ 201 |
| AM token se | POST /sales-orders (non-assigned client ka id) | ❌ 403: "You do not have access to this client" |
| Vendor token se | POST /sales-orders | ❌ 403: "This action requires one of the following roles: admin, account_manager" |

**Error Cases:**

| Test | Expected |
|------|----------|
| Duplicate order_number | ❌ 409: "Sales Order with number 'SO-2026-0001' already exists" |
| Non-existing client_id | ❌ 400: "Client with id=999 not found" |
| Inactive client | ❌ 400: "Client '...' is inactive – cannot create Sales Order" |
| Non-existing sku_id in line | ❌ 400: "SKU with id=999 not found" |
| Inactive SKU in line | ❌ 400: "SKU '...' is inactive and cannot be added to a Sales Order" |
| Address from different client | ❌ 400: "Address id=X not found or does not belong to client id=Y" |
| No tier pricing + no unit_price | ❌ 400: "No tier pricing found for SKU '...' at qty X. Please provide unit_price explicitly." |

---

### 8.2 — GET /sales-orders (Sab Sales Orders ki List)

**Permission:** ✅ Admin (sab) | ✅ AM (sirf assigned clients ke) | ❌ Vendor

1. **GET /sales-orders** pe jao
2. "Try it out" → "Execute" dbaao

**Admin ke sath:**
- ✅ Saari SOs dikhni chahiye

**AM ke sath:**
- ✅ SIRF un clients ki SOs dikhni chahiye jo AM ko assigned hain
- **Ye sabse zaroori test hai** – agar AM ko non-assigned client ki SO dikhe toh BUG hai

**Vendor ke sath:**
- ❌ 403: "This action requires one of the following roles: admin, account_manager"

**Response me kya hota hai (list item):**
```json
{
  "id": 1,
  "order_number": "SO-2026-0001",
  "client_id": 3,
  "client_name": "Charles Industries, LLC",
  "status": "pending",
  "order_date": "2026-03-10",
  "due_date": "2026-04-15",
  "line_count": 2,
  "total_amount": "3101.00",
  "created_at": "2026-03-11T..."
}
```

**Kya check karna hai:**
- ✅ `line_count` – kitni lines hain SO me
- ✅ `total_amount` – sum of (ordered_qty × unit_price) across all lines
- ✅ `client_name` – client ka naam dikhta hai

**Filters (Admin/AM token se):**

| Filter | URL | Expected |
|--------|-----|----------|
| By client | `GET /sales-orders?client_id=3` | Sirf us client ki SOs |
| By status | `GET /sales-orders?status=pending` | Sirf pending SOs |
| Search | `GET /sales-orders?search=SO-2026` | Order number me search |

Swagger me: Har filter ka apna field hai "Try it out" ke baad – values fill karo aur Execute dbaao.

---

### 8.3 — GET /sales-orders/{so_id} (SO ki Full Detail)

**Permission:** ✅ Admin (koi bhi) | ✅ AM (sirf assigned client ki) | ❌ Vendor

1. **GET /sales-orders/{so_id}** pe jao
2. `so_id` me actual SO ka ID daalo
3. "Execute" dbaao

**Admin se:** Koi bhi `so_id` → ✅ Full detail milegi

**AM se:**

| Test | so_id | Expected |
|------|-------|----------|
| Assigned client ki SO | Apni SO ka ID | ✅ Full detail |
| Non-assigned client ki SO | Doosri SO ka ID | ❌ 403: "You do not have access to this client" |
| Non-existing | `99999` | ❌ 404: "Sales Order with id=99999 not found" |

**Response me important fields:**
- `lines[]` – saari line items with `sku_code`, `sku_name`, prices, quantities
- `is_deletable` – `true` sirf jab status=PENDING aur koi delivery nahi hui
- `creator_name` – kisne banai thi SO
- Har line me:
  - `remaining_qty` = ordered_qty - delivered_qty (kitna bacha hai)
  - `invoiceable_qty` = delivered_qty - invoiced_qty (kitna invoice karna hai)

---

### 8.4 — PATCH /sales-orders/{so_id} (SO Header Update Karna)

**Permission:** ✅ Admin | ✅ AM (sirf assigned client ki SO) | ❌ Vendor

**Sirf header fields change hoti hain – lines yahan se nahi change hongi!**

1. **PATCH /sales-orders/{so_id}** pe jao
2. Body me SIRF wohi fields bhejo jo change karne hain:

```json
{
  "notes": "Updated: Customer confirmed - Net 45 payment terms",
  "due_date": "2026-05-01"
}
```

**Expected:** ✅ Updated SO ka full detail response

**Kya check karna hai:**
- `notes` aur `due_date` change ho gaye
- Baqi fields (order_number, client_id, lines) same rahein
- `updated_at` timestamp badal gaya

**Order number change test:**
- Naya unique order_number bhejo → ✅ Change ho jayega
- Kisi existing SO ka order_number bhejo → ❌ 409: "Sales Order with number '...' already exists"

**AM Permission Test:**
- AM apne assigned client ki SO update kar sakta hai → ✅
- AM doosre client ki SO update kare → ❌ 403

---

### 8.5 — DELETE /sales-orders/{so_id} (SO Delete Karna)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

**ZAROORI RULES:**
- **SIRF PENDING** status wali SO delete ho sakti hai
- **SIRF jab koi delivery nahi hui** (kisi bhi line ka delivered_qty = 0)
- Ye **HARD DELETE** hai – record permanently database se hat jayega

1. **DELETE /sales-orders/{so_id}** pe jao
2. Execute dbaao

**Expected:** ✅ `{"success": true, "data": {"message": "Sales Order deleted"}}`

**Error Cases:**

| Test | Expected |
|------|----------|
| Delete PENDING SO (no deliveries) | ✅ Deleted |
| Delete PARTIAL_DELIVERED SO | ❌ 400: "Cannot delete SO in 'partial_delivered' status..." |
| Delete SO with deliveries | ❌ 400: "Cannot delete SO with existing deliveries" |
| AM tries to delete | ❌ 403 |
| Vendor tries to delete | ❌ 403 |

**Verify karo:**
- Delete ke baad `GET /sales-orders/{so_id}` → ❌ 404 aana chahiye
- `GET /sales-orders` me bhi ye SO nahi dikhni chahiye

---

### 8.6 — POST /sales-orders/{so_id}/lines (SO me Line Add Karna)

**Permission:** ✅ Admin | ✅ AM (sirf assigned client ki SO) | ❌ Vendor

Existing SO me ek nayi line item add karo:

```json
{
  "sku_id": 1,
  "ordered_qty": 200,
  "unit_price": 2.99,
  "due_date": "2026-05-01"
}
```

**Expected:** ✅ 201 – Nayi line ban jayegi

**Kya check karna hai:**
- `line_number` **auto-assign** hoga (next available number, e.g. 3)
- Agar `unit_price` nahi bhejo toh tier pricing se auto-resolve hoga
- Agar `line_number` explicitly bhejo aur wo pehle se exist kare → ❌ 409: "Line number X already exists on SO..."

**Bina price ke test (tier auto-resolve):**
```json
{
  "sku_id": 1,
  "ordered_qty": 100
}
```
→ ✅ `unit_price` automatically tier se aayega (e.g. 3.51)

---

### 8.7 — PATCH /sales-orders/{so_id}/lines/{line_id} (Line Update Karna)

**Permission:** ✅ Admin | ✅ AM (sirf assigned client ki SO) | ❌ Vendor

**Sirf ye fields change ho sakte hain:**
- `ordered_qty` – kitna order kiya (par delivered_qty se kam nahi ho sakta)
- `due_date` – delivery date

**`unit_price` change NAHI hota** – locked at creation!

```json
{
  "ordered_qty": 300,
  "due_date": "2026-06-01"
}
```

**Expected:** ✅ Updated line aayegi response me

**Guard test:**
- Agar `ordered_qty` = 50 bhejo aur `delivered_qty` = 100 hai → ❌ 400: "Cannot set ordered_qty (50) below delivered_qty (100)"

---

### 8.8 — DELETE /sales-orders/{so_id}/lines/{line_id} (Line Delete Karna)

**Permission:** ✅ Admin | ✅ AM (sirf assigned client ki SO) | ❌ Vendor

**HARD DELETE** – line permanently hat jayegi

**Guard:** Agar line ka `delivered_qty > 0` → ❌ 400: "Cannot delete line with X units already delivered"

1. `so_id` aur `line_id` daalo → Execute

**Expected:** ✅ `{"success": true, "data": {"message": "SO Line deleted"}}`

**Verify:** `GET /sales-orders/{so_id}` se check karo ke line list me se hat gayi

---

## SECTION 9: PURCHASE ORDER APIs Test Karna

> **Permission Rule:** Purchase Orders SO se auto-generate hoti hain – har vendor ke liye ek PO banta hai. Admin aur AM POs generate kar sakty hain. Vendor SIRF apni POs dekh aur update kar sakta hai. Delete SIRF Admin.

### 🔑 Purchase Order ke Key Concepts (Samajhna Zaroori Hai)

**Purchase Order kya hai?**
Jab Sales Order save hoti hai, system us ke line items ko vendors ke hisab se split karta hai. Agar SO me 5 line items hain aur 3 Vendor-A ke aur 2 Vendor-B ke hain, toh:
- **PO-{SO-Number}-A** → Vendor-A ke liye (3 lines)
- **PO-{SO-Number}-B** → Vendor-B ke liye (2 lines)

**PO Auto-Generation Flow:**
1. Admin/AM pehle SO create karta hai (with lines)
2. Phir `POST /sales-orders/{so_id}/generate-pos` call karta hai
3. System har SO line ke SKU ka default vendor dhundta hai (SKUVendor table se)
4. Lines ko vendor ke hisab se group karta hai
5. Har vendor ke liye ek PO create karta hai with corresponding PO lines
6. PO number automatic banta hai: `PO-{SO_order_number}-A`, `-B`, `-C`...

**Vendor Resolution Order:**
- Pehle `sku_vendors` table me `is_default=true` check hota hai
- Phir `SKU.default_vendor_id` check hota hai
- Phir koi bhi linked vendor (fallback)
- Agar koi vendor nahi mila → Error (pehle vendor assign karo SKU ko)

**PO Status Flow (Shipment Type pe depend karta hai):**

**Drop-Ship Flow** (vendor seedha customer ko bhejta hai):
```
IN_PRODUCTION → PACKED_AND_SHIPPED → DELIVERED
```

**In-House Flow** (vendor pehle warehouse me bhejta hai, phir customer ko):
```
IN_PRODUCTION → PACKED_AND_SHIPPED → READY_FOR_PICKUP → DELIVERED
```

**Status Rules:**
- PO hamesha `IN_PRODUCTION` status se start hoti hai
- Status SIRF aage badh sakta hai – peeche nahi ja sakta
- `READY_FOR_PICKUP` status SIRF `in_house` shipment type ke liye hai
- Drop-ship me `READY_FOR_PICKUP` allowed nahi hai
- Invalid transition pe 400 Error aayega

**Shipment Type:**
- `drop_ship` – Vendor seedha customer ko ship karta hai
- `in_house` – Vendor pehle aapke warehouse me bhejta hai
- Shipment type SIRF `IN_PRODUCTION` status me change ho sakti hai

**Per-Line Dates:**
Har PO line ka apna `due_date`, `expected_ship_date`, aur `expected_arrival_date` ho sakta hai – vendor update karta hai taake business ko schedule pata rahe.

---

### 9.1 — POST /sales-orders/{so_id}/generate-pos (POs Auto-Generate Karna)

**Permission:** ✅ Admin | ✅ AM (sirf assigned client ki SO) | ❌ Vendor

**ZAROORI PREREQUISITES:**
1. SO exist kare aur lines hon
2. Har line ke SKU ka ek vendor assigned ho (via `POST /skus/{sku_id}/vendors`)
3. SO ke liye pehle se POs exist nahi karni chahiye

**Pehle:** Admin ka token Authorize me set karo

1. **POST /sales-orders/{so_id}/generate-pos** pe jao
2. `so_id` me apni Sales Order ka ID daalo
3. Body me shipment type bhejo:

```json
{
  "shipment_type": "drop_ship"
}
```

**shipment_type ke 2 options:**
- `drop_ship` – Vendor seedha customer ko ship karega
- `in_house` – Vendor pehle warehouse me bhejega

4. "Execute" dbaao

**Expected:** ✅ 201 status – POs generate ho jayengi

**Response Example:**
```json
{
  "success": true,
  "data": {
    "message": "2 Purchase Order(s) generated",
    "purchase_orders": [
      {
        "id": 1,
        "po_number": "PO-SO-2026-0001-A",
        "sales_order_id": 1,
        "so_order_number": "SO-2026-0001",
        "vendor_id": 4,
        "vendor_name": "ManufactureX Inc",
        "client_name": "Charles Industries, LLC",
        "shipment_type": "drop_ship",
        "status": "in_production",
        "is_deletable": true,
        "lines": [
          {
            "id": 1,
            "so_line_id": 1,
            "sku_id": 1,
            "sku_code": "SKU-BOLT-A1",
            "sku_name": "Hex Bolt A1",
            "quantity": 100,
            "due_date": "2026-04-01"
          },
          {
            "id": 2,
            "so_line_id": 2,
            "sku_id": 2,
            "sku_code": "SKU-NUT-B2",
            "sku_name": "Nut B2",
            "quantity": 200,
            "due_date": "2026-04-15"
          }
        ]
      },
      {
        "id": 2,
        "po_number": "PO-SO-2026-0001-B",
        "vendor_id": 5,
        "vendor_name": "PartsCo Ltd",
        "status": "in_production",
        "lines": [
          {
            "id": 3,
            "sku_code": "SKU-WASHER-C3",
            "quantity": 50,
            "due_date": "2026-04-20"
          }
        ]
      }
    ]
  }
}
```

**Kya check karna hai:**
- ✅ Vendors ke hisab se split hua – har vendor ki alag PO
- ✅ PO number format sahi hai: `PO-{SO-Number}-A`, `-B`
- ✅ Har PO line ka `so_line_id` sahi SO line se mapped hai
- ✅ `quantity` = SO line ka `ordered_qty`
- ✅ `due_date` SO line se copy hua
- ✅ Status `in_production` hai (starting status)
- ✅ `is_deletable: true` (abhi IN_PRODUCTION me hai)

**Error Cases:**

| Test | Expected |
|------|----------|
| SO me lines nahi hain | ❌ 400: "Cannot generate POs – Sales Order has no line items" |
| POs already exist for this SO | ❌ 409: "Purchase Orders already exist for SO '...' Delete existing POs first..." |
| SKU ka vendor assign nahi hai | ❌ 400: "Cannot resolve vendor for SKU(s): SKU-CODE. Please assign a default vendor..." |
| Non-existing SO | ❌ 404: "Sales Order with id=X not found" |
| AM non-assigned client ki SO | ❌ 403: "You do not have access to this client" |
| Vendor tries to generate | ❌ 403: "This action requires one of the following roles: admin, account_manager" |

**Dobara Generate Karna:**
- Agar POs delete kar do (sirf IN_PRODUCTION status me possible), toh dobara generate kar sakty ho
- Pehle purani POs delete karo → phir generate karo

---

### 9.2 — GET /purchase-orders (Sab POs ki List)

**Permission:** ✅ Admin (sab) | ✅ AM (sirf assigned clients ki SO se related) | ✅ Vendor (sirf apni)

1. **GET /purchase-orders** pe jao
2. "Try it out" → "Execute" dbaao

**Admin ke sath:**
- ✅ Saari POs dikhni chahiye

**AM ke sath:**
- ✅ SIRF un POs ki list aayegi jin ki parent SO assigned clients se hai
- AM ke non-assigned clients ki POs NAHI dikhni chahiye
- **Ye zaroori test hai** – AM ka scoping SO → client ke through hota hai

**Vendor ke sath:**
- ✅ SIRF apni POs dikhni chahiye (jahan PO.vendor_id = vendor ka linked vendor)
- Doosre vendors ki POs bilkul nahi dikhni chahiye

**Response me kya hota hai (list item):**
```json
{
  "id": 1,
  "po_number": "PO-SO-2026-0001-A",
  "sales_order_id": 1,
  "so_order_number": "SO-2026-0001",
  "vendor_id": 4,
  "vendor_name": "ManufactureX Inc",
  "client_name": "Charles Industries, LLC",
  "shipment_type": "drop_ship",
  "status": "in_production",
  "line_count": 2,
  "total_quantity": 300,
  "created_at": "2026-03-12T..."
}
```

**Kya check karna hai:**
- ✅ `line_count` – PO me kitni lines hain
- ✅ `total_quantity` – saari lines ki total quantity
- ✅ `vendor_name` aur `client_name` dikhte hain
- ✅ `so_order_number` – kis SO se generate hui

**Filters (Swagger me "Try it out" ke baad dikhte hain):**

| Filter | URL | Expected |
|--------|-----|----------|
| By SO | `GET /purchase-orders?sales_order_id=1` | Sirf us SO ki POs |
| By vendor | `GET /purchase-orders?vendor_id=4` | Sirf us vendor ki POs |
| By status | `GET /purchase-orders?status=in_production` | Sirf in_production POs |
| By shipment | `GET /purchase-orders?shipment_type=drop_ship` | Sirf drop_ship POs |
| Search | `GET /purchase-orders?search=PO-SO-2026` | PO number me search |

---

### 9.3 — GET /purchase-orders/{po_id} (PO ki Full Detail)

**Permission:** ✅ Admin (koi bhi) | ✅ AM (sirf assigned client ki SO se related) | ✅ Vendor (sirf apni)

1. **GET /purchase-orders/{po_id}** pe jao
2. `po_id` me actual PO ka ID daalo
3. "Execute" dbaao

**Admin se:** Koi bhi `po_id` → ✅ Full detail milegi

**AM se:**

| Test | po_id | Expected |
|------|-------|----------|
| Assigned client ki SO se generated PO | Apni PO ka ID | ✅ Full detail |
| Non-assigned client ki PO | Doosri PO ka ID | ❌ 403: "You do not have access to this Purchase Order" |
| Non-existing | `99999` | ❌ 404: "Purchase Order with id=99999 not found" |

**Vendor se:**

| Test | po_id | Expected |
|------|-------|----------|
| Apni PO (vendor_id match) | Apni PO ka ID | ✅ Full detail |
| Doosre vendor ki PO | Doosri PO ka ID | ❌ 403: "You can only access your own Purchase Orders" |

**Response me kya hota hai:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "po_number": "PO-SO-2026-0001-A",
    "sales_order_id": 1,
    "so_order_number": "SO-2026-0001",
    "vendor_id": 4,
    "vendor_name": "ManufactureX Inc",
    "client_name": "Charles Industries, LLC",
    "shipment_type": "drop_ship",
    "status": "in_production",
    "expected_ship_date": null,
    "expected_arrival_date": null,
    "is_deletable": true,
    "created_at": "...",
    "updated_at": "...",
    "lines": [
      {
        "id": 1,
        "purchase_order_id": 1,
        "so_line_id": 1,
        "sku_id": 1,
        "sku_code": "SKU-BOLT-A1",
        "sku_name": "Hex Bolt A1",
        "quantity": 100,
        "due_date": "2026-04-01",
        "expected_ship_date": null,
        "expected_arrival_date": null
      }
    ]
  }
}
```

**Kya check karna hai:**
- ✅ `is_deletable` – sirf `true` jab status=`in_production`
- ✅ Lines me `sku_code` aur `sku_name` dikhte hain
- ✅ `so_line_id` sahi mapped hai (back-reference to SO line)

---

### 9.4 — PATCH /purchase-orders/{po_id} (PO Update – Status, Dates, Shipment Type)

**Permission:** ✅ Admin | ✅ AM (sirf assigned) | ✅ Vendor (sirf apni)

**Ye sabse important endpoint hai PO ke liye** – vendor yahan se status update karta hai.

1. **PATCH /purchase-orders/{po_id}** pe jao
2. Body me SIRF wohi fields bhejo jo change karne hain:

**Status Update (Drop-Ship Flow):**

**Step 1 – IN_PRODUCTION → PACKED_AND_SHIPPED:**
```json
{
  "status": "packed_and_shipped",
  "expected_ship_date": "2026-03-25"
}
```

**Step 2 – PACKED_AND_SHIPPED → DELIVERED:**
```json
{
  "status": "delivered",
  "expected_arrival_date": "2026-04-01"
}
```

**Status Update (In-House Flow):**

**Step 1 – IN_PRODUCTION → PACKED_AND_SHIPPED:**
```json
{
  "status": "packed_and_shipped",
  "expected_ship_date": "2026-03-25"
}
```

**Step 2 – PACKED_AND_SHIPPED → READY_FOR_PICKUP:**
```json
{
  "status": "ready_for_pickup"
}
```

**Step 3 – READY_FOR_PICKUP → DELIVERED:**
```json
{
  "status": "delivered",
  "expected_arrival_date": "2026-04-01"
}
```

**Shipment Type Change:**
```json
{
  "shipment_type": "in_house"
}
```
> ⚠️ Shipment type SIRF `in_production` status me change ho sakta hai!

**Date Update (bina status change ke):**
```json
{
  "expected_ship_date": "2026-04-05",
  "expected_arrival_date": "2026-04-15"
}
```

**Expected:** ✅ Updated PO ka full detail response

**Kya check karna hai:**
- ✅ Status sahi badla
- ✅ Dates properly set hue
- ✅ `is_deletable` status ke sath update hua (IN_PRODUCTION = true, baqi = false)
- ✅ `updated_at` timestamp badal gaya

**Invalid Status Transition Tests:**

| Current Status | New Status | Shipment | Expected |
|---------------|------------|----------|----------|
| in_production | packed_and_shipped | Both | ✅ Valid |
| packed_and_shipped | delivered | drop_ship | ✅ Valid |
| packed_and_shipped | ready_for_pickup | in_house | ✅ Valid |
| ready_for_pickup | delivered | in_house | ✅ Valid |
| packed_and_shipped | in_production | Both | ❌ 400 Invalid transition |
| delivered | packed_and_shipped | Both | ❌ 400 Invalid transition |
| packed_and_shipped | ready_for_pickup | drop_ship | ❌ 400 Invalid transition (sirf in_house) |
| in_production | delivered | Both | ❌ 400 Invalid transition (skip nahi ho sakta) |

**Error message example:**
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid status transition for Drop-Ship flow: 'packed_and_shipped' → 'in_production'. Valid next: [delivered]"
  }
}
```

---

### 9.5 — DELETE /purchase-orders/{po_id} (PO Delete Karna)

**Permission:** ✅ Admin | ❌ AM | ❌ Vendor

**ZAROORI RULE:**
- **SIRF `in_production`** status wali PO delete ho sakti hai
- **HARD DELETE** – permanently database se hat jayegi

1. **DELETE /purchase-orders/{po_id}** pe jao
2. Execute dbaao

**Expected:** ✅ `{"success": true, "data": {"message": "Purchase Order deleted"}}`

**Error Cases:**

| Test | Expected |
|------|----------|
| Delete IN_PRODUCTION PO | ✅ Deleted |
| Delete PACKED_AND_SHIPPED PO | ❌ 400: "Cannot delete PO in 'packed_and_shipped' status. Only IN_PRODUCTION POs can be deleted." |
| Delete DELIVERED PO | ❌ 400: Same error |
| AM tries to delete | ❌ 403: roles error |
| Vendor tries to delete | ❌ 403: roles error |

**Baad me dobara generate:**
- PO delete karne ke baad `POST /sales-orders/{so_id}/generate-pos` se dobara generate kar sakty ho

---

### 9.6 — PATCH /purchase-orders/{po_id}/lines/{line_id} (PO Line Dates Update)

**Permission:** ✅ Admin | ✅ AM (sirf assigned) | ✅ Vendor (sirf apni PO ki lines)

Vendor yahan se individual PO lines ke schedule update karta hai:

1. **PATCH /purchase-orders/{po_id}/lines/{line_id}** pe jao
2. `po_id` aur `line_id` daalo
3. Body me dates bhejo:

```json
{
  "due_date": "2026-04-10",
  "expected_ship_date": "2026-04-01",
  "expected_arrival_date": "2026-04-15"
}
```

**Expected:** ✅ Updated PO line response with sku_code aur sku_name

**Response Example:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "purchase_order_id": 1,
    "so_line_id": 1,
    "sku_id": 1,
    "sku_code": "SKU-BOLT-A1",
    "sku_name": "Hex Bolt A1",
    "quantity": 100,
    "due_date": "2026-04-10",
    "expected_ship_date": "2026-04-01",
    "expected_arrival_date": "2026-04-15"
  }
}
```

**Kya check karna hai:**
- ✅ Dates properly set hue
- ✅ `sku_code` aur `sku_name` dikhte hain

**Error Cases:**

| Test | Expected |
|------|----------|
| Galat line_id | ❌ 404: "PO Line id=X not found on PO..." |
| Line doosri PO ki (po_id mismatch) | ❌ 404: Same error |
| Vendor doosri PO ki line update kare | ❌ 403: "You can only access your own Purchase Orders" |

---

## SECTION 10: COMPLETE PERMISSION MATRIX (Summary)

### Ye table yaad rakhna – sabse important hai (ab Purchase Orders bhi shamil hain):

| Endpoint | Method | Admin | AM | Vendor |
|----------|--------|-------|----|--------|
| `/auth/login` | POST | ✅ | ✅ | ✅ |
| `/auth/refresh` | POST | ✅ | ✅ | ✅ |
| `/auth/me` | GET | ✅ | ✅ | ✅ |
| `/health` | GET | ✅ (no auth) | ✅ (no auth) | ✅ (no auth) |
| `/clients` | GET | ✅ SAB | ✅ SIRF ASSIGNED | ❌ 403 |
| `/clients/{id}` | GET | ✅ KOI BHI | ✅ SIRF ASSIGNED | ❌ 403 |
| `/clients` | POST | ✅ | ❌ 403 | ❌ 403 |
| `/clients/{id}` | PATCH | ✅ | ❌ 403 | ❌ 403 |
| `/clients/{id}` | DELETE | ✅ | ❌ 403 | ❌ 403 |
| `/clients/{id}/contacts` | POST | ✅ | ❌ 403 | ❌ 403 |
| `/clients/{id}/contacts/{cid}` | PATCH | ✅ | ❌ 403 | ❌ 403 |
| `/clients/{id}/contacts/{cid}` | DELETE | ✅ | ❌ 403 | ❌ 403 |
| `/clients/{id}/addresses` | POST | ✅ | ❌ 403 | ❌ 403 |
| `/clients/{id}/addresses/{aid}` | PATCH | ✅ | ❌ 403 | ❌ 403 |
| `/clients/{id}/addresses/{aid}` | DELETE | ✅ | ❌ 403 | ❌ 403 |
| `/vendors` | GET | ✅ SAB | ✅ SAB | ✅ SIRF APNA |
| `/vendors/{id}` | GET | ✅ KOI BHI | ✅ KOI BHI | ✅ SIRF APNA |
| `/vendors` | POST | ✅ | ❌ 403 | ❌ 403 |
| `/vendors/{id}` | PATCH | ✅ | ❌ 403 | ❌ 403 |
| `/vendors/{id}` | DELETE | ✅ | ❌ 403 | ❌ 403 |
| `/skus` | GET | ✅ | ✅ | ✅ |
| `/skus/{id}` | GET | ✅ | ✅ | ✅ |
| `/skus` | POST | ✅ | ❌ 403 | ❌ 403 |
| `/skus/{id}` | PATCH | ✅ | ❌ 403 | ❌ 403 |
| `/skus/{id}` | DELETE | ✅ | ❌ 403 | ❌ 403 |
| `/skus/{id}/tiers` | POST | ✅ | ❌ 403 | ❌ 403 |
| `/skus/{id}/tiers/{tid}` | PATCH | ✅ | ❌ 403 | ❌ 403 |
| `/skus/{id}/tiers/{tid}` | DELETE | ✅ | ❌ 403 | ❌ 403 |
| `/skus/{id}/tiers` | PUT | ✅ | ❌ 403 | ❌ 403 |
| `/skus/{id}/vendors` | GET | ✅ | ✅ | ✅ |
| `/skus/{id}/vendors` | POST | ✅ | ❌ 403 | ❌ 403 |
| `/skus/{id}/vendors/{vid}` | DELETE | ✅ | ❌ 403 | ❌ 403 |
| `/sales-orders` | GET | ✅ SAB | ✅ SIRF ASSIGNED CLIENTS | ❌ 403 |
| `/sales-orders/{id}` | GET | ✅ KOI BHI | ✅ SIRF ASSIGNED CLIENT | ❌ 403 |
| `/sales-orders` | POST | ✅ | ✅ SIRF ASSIGNED CLIENT | ❌ 403 |
| `/sales-orders/{id}` | PATCH | ✅ | ✅ SIRF ASSIGNED CLIENT | ❌ 403 |
| `/sales-orders/{id}` | DELETE | ✅ | ❌ 403 | ❌ 403 |
| `/sales-orders/{id}/lines` | POST | ✅ | ✅ SIRF ASSIGNED CLIENT | ❌ 403 |
| `/sales-orders/{id}/lines/{lid}` | PATCH | ✅ | ✅ SIRF ASSIGNED CLIENT | ❌ 403 |
| `/sales-orders/{id}/lines/{lid}` | DELETE | ✅ | ✅ SIRF ASSIGNED CLIENT | ❌ 403 |
| `/sales-orders/{id}/generate-pos` | POST | ✅ | ✅ SIRF ASSIGNED CLIENT | ❌ 403 |
| `/purchase-orders` | GET | ✅ SAB | ✅ SIRF ASSIGNED CLIENTS KI | ✅ SIRF APNI |
| `/purchase-orders/{id}` | GET | ✅ KOI BHI | ✅ SIRF ASSIGNED CLIENT KI | ✅ SIRF APNI |
| `/purchase-orders/{id}` | PATCH | ✅ | ✅ SIRF ASSIGNED CLIENT KI | ✅ SIRF APNI |
| `/purchase-orders/{id}` | DELETE | ✅ | ❌ 403 | ❌ 403 |
| `/purchase-orders/{id}/lines/{lid}` | PATCH | ✅ | ✅ SIRF ASSIGNED CLIENT KI | ✅ SIRF APNI |

---

## SECTION 11: STEP-BY-STEP FULL TEST FLOW

Ye poora flow follow karo – ek ek karke, isi order me:

### Phase 1: Admin se Sab Setup Karo

1. ✅ **Login** → `POST /auth/login` (admin@gmail.com / admin123) → Token copy karo
2. ✅ **Authorize** → Swagger me Authorize button → Token paste karo
3. ✅ **Me check** → `GET /auth/me` → Confirm: role=admin
4. ✅ **Vendor banao** → `POST /vendors` → "DPM Manufacturing"
5. ✅ **Ek aur Vendor** → `POST /vendors` → "Golden Star Industries"
6. ✅ **Client banao** → `POST /clients` → "Charles Industries, LLC" (contacts + addresses ke sath)
7. ✅ **Ek aur Client** → `POST /clients` → "ABC Corporation" (simple, bina contacts/addresses ke)
8. ✅ **SKU banao** → `POST /skus` → "80-003099-A" with tier prices
9. ✅ **Ek aur SKU** → `POST /skus` → "45-001234-B"
10. ✅ **Vendor link** → `POST /skus/{sku_id}/vendors` → DPM ko SKU se jodo
11. ✅ **List check** → `GET /clients`, `GET /vendors`, `GET /skus` → Sab dikhne chahiye
12. ✅ **Detail check** → `GET /clients/{id}`, `GET /vendors/{id}`, `GET /skus/{id}`
13. ✅ **Update test** → `PATCH /clients/{id}` → payment_terms change karo
14. ✅ **Contact add** → `POST /clients/{id}/contacts` → naya contact
15. ✅ **Address add** → `POST /clients/{id}/addresses` → nayi address
16. ✅ **Tier update** → `PATCH /skus/{id}/tiers/{tid}` → price change karo
17. ✅ **Refresh** → `POST /auth/refresh` → naya token milna chahiye

### Phase 1B: Admin se Sales Orders Test Karo

18. ✅ **SO banao** → `POST /sales-orders` → "SO-2026-0001" with 2 lines (ek bina price → tier auto-lock, ek with price)
19. ✅ **SO list** → `GET /sales-orders` → Saari SOs dikhni chahiye (line_count, total_amount check karo)
20. ✅ **SO detail** → `GET /sales-orders/{id}` → Full detail with lines, sku_code, remaining_qty check karo
21. ✅ **SO update** → `PATCH /sales-orders/{id}` → notes ya due_date change karo
22. ✅ **Line add** → `POST /sales-orders/{id}/lines` → nayi line (auto line_number check karo)
23. ✅ **Line update** → `PATCH /sales-orders/{id}/lines/{lid}` → ordered_qty change karo
24. ✅ **Line delete** → `DELETE /sales-orders/{id}/lines/{lid}` → line hat jani chahiye
25. ✅ **SO filters** → `GET /sales-orders?status=pending`, `?search=SO-2026`, `?client_id=X`
26. ❌ **Duplicate SO** → Same order_number se dobara → **409 Error**
27. ❌ **Inactive client SO** → Inactive client ke liye SO → **400 Error**

### Phase 1C: Admin se Purchase Orders Test Karo

28. ✅ **POs Generate** → `POST /sales-orders/{so_id}/generate-pos` → `{"shipment_type": "drop_ship"}` → **2 POs ban jayengi (vendor ke hisab se split)**
29. ✅ **PO List** → `GET /purchase-orders` → Saari POs dikhni chahiye with line_count, total_quantity
30. ✅ **PO Detail** → `GET /purchase-orders/{po_id}` → Full detail with lines, sku_code
31. ✅ **PO Status Update** → `PATCH /purchase-orders/{po_id}` → `{"status": "packed_and_shipped", "expected_ship_date": "2026-03-25"}` → Status badal gaya
32. ❌ **Invalid Transition** → `{"status": "in_production"}` → **400 Error** (peeche nahi ja sakta)
33. ✅ **PO Deliver** → `{"status": "delivered"}` → Drop-ship flow complete
34. ✅ **PO Line Update** → `PATCH /purchase-orders/{po_id}/lines/{line_id}` → `{"expected_ship_date": "2026-04-01"}` → Dates set hue
35. ✅ **PO Delete** → `DELETE /purchase-orders/{po_id}` → (sirf IN_PRODUCTION wali) → ✅ Deleted
36. ❌ **Delete DELIVERED PO** → **400 Error** (sirf IN_PRODUCTION delete hoti hai)
37. ❌ **Double Generate** → Same SO ke liye dobara → **409 Error**
38. ✅ **PO Filters** → `GET /purchase-orders?status=in_production`, `?vendor_id=X`, `?sales_order_id=Y`

### Phase 2: AM se Test Karo (Permissions Verify)

39. ✅ **AM Login** → `POST /auth/login` (am@gmail.com / am123)
40. ✅ **Authorize** → Purana token hatao, AM ka token paste karo
41. ✅ **Me check** → `GET /auth/me` → role=account_manager, client_ids me assigned client ka ID
42. ✅ **Clients list** → `GET /clients` → **SIRF TestClient LLC dikhni chahiye**
43. ❌ **Doosri client** → `GET /clients/{charles_id}` → **403 Error aana chahiye**
44. ❌ **Client create** → `POST /clients` → **403 Error**
45. ❌ **Client update** → `PATCH /clients/{id}` → **403 Error**
46. ❌ **Client delete** → `DELETE /clients/{id}` → **403 Error**
47. ✅ **Vendors list** → `GET /vendors` → **Saari vendors dikhni chahiye**
48. ✅ **SKUs list** → `GET /skus` → **Saari SKUs dikhni chahiye**
49. ❌ **Vendor create** → `POST /vendors` → **403 Error**
50. ❌ **SKU create** → `POST /skus` → **403 Error**
51. ❌ **Tier add** → `POST /skus/{id}/tiers` → **403 Error**
52. ✅ **AM SO create** → `POST /sales-orders` (assigned client ke liye) → **✅ 201**
53. ✅ **AM SO list** → `GET /sales-orders` → **SIRF assigned client ki SOs**
54. ❌ **AM SO doosri client** → `GET /sales-orders/{non_assigned_so_id}` → **403 Error**
55. ✅ **AM SO update** → `PATCH /sales-orders/{assigned_so_id}` → **✅ Updated**
56. ✅ **AM line add** → `POST /sales-orders/{id}/lines` → **✅ Line added**
57. ❌ **AM SO delete** → `DELETE /sales-orders/{id}` → **403 Error** (sirf Admin)
58. ✅ **AM PO list** → `GET /purchase-orders` → **SIRF assigned client ki SOs se related POs**
59. ✅ **AM PO detail** → `GET /purchase-orders/{assigned_po_id}` → **✅ Detail milegi**
60. ❌ **AM non-assigned PO** → `GET /purchase-orders/{non_assigned_po_id}` → **403 Error**
61. ✅ **AM PO update** → `PATCH /purchase-orders/{po_id}` → **✅ Status/dates change ho jayengi**
62. ❌ **AM PO delete** → `DELETE /purchase-orders/{po_id}` → **403 Error** (sirf Admin)

### Phase 3: Vendor se Test Karo (Permissions Verify)

63. ✅ **Vendor Login** → `POST /auth/login` (vendor@gmail.com / vendor123)
64. ✅ **Authorize** → Vendor ka token paste karo
65. ✅ **Me check** → `GET /auth/me` → role=vendor, vendor_id present
66. ❌ **Clients list** → `GET /clients` → **403 Error**
67. ❌ **Client detail** → `GET /clients/{id}` → **403 Error**
68. ✅ **Vendors list** → `GET /vendors` → **SIRF apna vendor record (TestVendor Corp)**
69. ✅ **Apna vendor** → `GET /vendors/{apna_id}` → **✅ Detail milegi**
70. ❌ **Doosra vendor** → `GET /vendors/{doosra_id}` → **403: "You can only view your own vendor record"**
71. ✅ **SKUs list** → `GET /skus` → **Saari SKUs dikhni chahiye**
72. ✅ **SKU detail** → `GET /skus/{id}` → **Detail milegi**
73. ❌ **Vendor create** → `POST /vendors` → **403 Error**
74. ❌ **SKU create** → `POST /skus` → **403 Error**
75. ❌ **Client create** → `POST /clients` → **403 Error**
76. ❌ **SO list** → `GET /sales-orders` → **403 Error** (Vendor ko SO access nahi)
77. ❌ **SO create** → `POST /sales-orders` → **403 Error**
78. ✅ **Vendor PO list** → `GET /purchase-orders` → **SIRF apni POs dikhni chahiye**
79. ✅ **Apni PO detail** → `GET /purchase-orders/{apni_po_id}` → **✅ Detail milegi**
80. ❌ **Doosri vendor ki PO** → `GET /purchase-orders/{doosri_po_id}` → **403: "You can only access your own Purchase Orders"**
81. ✅ **Vendor PO status update** → `PATCH /purchase-orders/{apni_po_id}` → `{"status": "packed_and_shipped"}` → **✅ Status change hua**
82. ✅ **Vendor PO line update** → `PATCH /purchase-orders/{po_id}/lines/{line_id}` → dates update → **✅**
83. ❌ **Vendor PO delete** → `DELETE /purchase-orders/{po_id}` → **403 Error** (sirf Admin)
84. ❌ **Vendor PO generate** → `POST /sales-orders/{so_id}/generate-pos` → **403 Error**

### Phase 4: Error Cases Test Karo

85. ❌ **Bina token ke** → Authorize hata do → `GET /sales-orders` → **401: "Missing authorization header"**
86. ❌ **Galat token** → Authorize me `random_invalid_token` daalo → **401: "Invalid or expired token"**
87. ❌ **Non-existing SO** → `GET /sales-orders/99999` → **404: "Sales Order with id=99999 not found"**
88. ❌ **Non-existing PO** → `GET /purchase-orders/99999` → **404: "Purchase Order with id=99999 not found"**
89. ❌ **Duplicate SO** → Same order_number se dobara banao → **409: Conflict Error**
90. ❌ **Double PO generate** → Same SO ke liye dobara generate → **409: "Purchase Orders already exist..."**
91. ❌ **Delete non-IN_PRODUCTION PO** → **400: "Cannot delete PO in '...' status"**
92. ❌ **Invalid PO transition** → Drop-ship me ready_for_pickup → **400: "Invalid status transition..."**

### Phase 5: Cleanup Test

93. ✅ **Delete POs** (Admin, sirf IN_PRODUCTION) → `DELETE /purchase-orders/{id}`
94. ✅ **Delete SO** (Admin) → `DELETE /sales-orders/{id}` → ✅ Deleted
95. ❌ **Verify deleted** → `GET /sales-orders/{id}` → **404 aana chahiye**

---

## SECTION 12: ERROR RESPONSES SAMAJHNA

System me ye standard error formats hain:

### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid email or password"
  }
}
```
**Kab aata hai:** Galat login, token expire ho gaya, token nahi bheja

### 403 Forbidden
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "This action requires one of the following roles: admin"
  }
}
```
**Kab aata hai:** Role ke hisab se allowed nahi hai (AM trying to create client, Vendor trying to see other vendor)

### 404 Not Found
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Client with id=99999 not found"
  }
}
```
**Kab aata hai:** ID galat hai, record exist nahi karta

### 409 Conflict
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "A client with the name 'Charles Industries, LLC' already exists"
  }
}
```
**Kab aata hai:** Duplicate record banana (same company name, same sku_code)

### 400 Bad Request
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Vendor with id=999 not found"
  }
}
```
**Kab aata hai:** Invalid data bheja (non-existing vendor_id as default_vendor_id)

---

## SECTION 13: TIPS AUR SHORTCUTS

### Swagger UI Tips:
- **Token switch karna:** Authorize button → Logout → naya token paste → Authorize
- **Filters use karna:** "Try it out" ke baad Query Parameters me values fill karo
- **Path parameters:** Jaise `{client_id}` – ye fields auto-show hoti hain "Try it out" ke baad
- **Request body:** JSON format me likho, Swagger khud validate karega

### Jaldi Test Karne Ka Tareeqa:
1. Pehle Admin se sab data create karo (clients, vendors, SKUs)
2. Phir AM token se switch karke check karo ke kya dikhra hai kya nahi
3. Phir Vendor token se switch karke same check karo
4. Har switch pe: Login → Token copy → Authorize → Test

### Yaad Rakhne Wali Cheezein:
- **Admin** = God mode – sab kuch access, sab kuch create/edit/delete
- **AM** = Client-scoped – sirf assigned clients ke SOs/clients, vendors/SKUs read-only
- **Vendor** = Apna record – sirf apna vendor, SKUs read-only, clients aur SOs bilkul nahi
- **Soft Delete** = Record nahi mitti, `is_active=false` hota hai (clients, vendors, SKUs)
- **Hard Delete** = Record permanently mit jata hai (contacts, addresses, tier prices, SO lines, Sales Orders)
- **Default logic** = Ek time pe sirf ek default (address, sku_vendor) – naya default set karne pe purana hatt jata hai

### Sales Order Specific Yaad Rakhne Wali Cheezein:
- **Tier Price Lock** = SO line banate waqt price lock ho jata hai – baad me change nahi hota
- **Status Derived** = SO ka status kabhi manually set nahi hota – line items se auto-calculate hota hai
- **AM + SO** = AM apne assigned clients ke liye SO create/edit/view kar sakta hai, delete nahi
- **SO Delete Guard** = Sirf PENDING status + zero deliveries wali SO delete ho sakti hai
- **Line Delete Guard** = Sirf wo line delete ho sakti hai jis pe koi delivery nahi hui
- **ordered_qty Guard** = Line ka ordered_qty kabhi delivered_qty se kam nahi ho sakta
- **Per-Line Due Dates** = Har line item ka apna alag due_date ho sakta hai
- **line_number Auto** = Agar line_number nahi bhejo toh automatically next number assign hota hai

### Purchase Order Specific Yaad Rakhne Wali Cheezein:
- **PO Auto-Generate** = SO se generate hoti hain, manually create nahi hoti
- **One PO per Vendor** = SO lines vendor ke hisab se split hoti hain – har vendor ki alag PO
- **PO Number Format** = `PO-{SO-Number}-A`, `-B`, `-C`... (sequential suffix)
- **Vendor Resolution** = SKUVendor (is_default) → SKU.default_vendor_id → any linked vendor
- **Status Flow** = Fixed sequence: IN_PRODUCTION → PACKED_AND_SHIPPED → [READY_FOR_PICKUP] → DELIVERED
- **Drop-Ship vs In-House** = Drop-ship me READY_FOR_PICKUP nahi hai, In-House me hai
- **Status Sirf Aage** = Status peeche nahi ja sakta – invalid transition pe 400 Error
- **Shipment Type Lock** = Shipment type sirf IN_PRODUCTION me change ho sakti hai
- **PO Delete** = Sirf IN_PRODUCTION status me delete ho sakti hai, SIRF Admin
- **Re-Generate** = Pehle purani POs delete karo, phir dobara generate karo
- **Vendor Access** = Vendor SIRF apni POs dekh/update kar sakta hai, doosre ki nahi
- **AM Access via SO** = AM ko PO access SO ki client ke through milta hai
- **Per-Line Dates** = Har PO line ka alag due_date, expected_ship_date, expected_arrival_date
