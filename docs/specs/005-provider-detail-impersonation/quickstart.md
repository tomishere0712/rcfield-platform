# Quickstart: Admin Provider Detail & Impersonation

Implementation order: **Backend → Frontend foundation → Frontend pages**

---

## Phase 1: Backend (2 new endpoints)

### 1.1 — Modify `AuthPayload` type

File: `rcfeild-be/src/types/index.ts`

```typescript
export interface AuthPayload {
  userId: string;
  role: UserRole;
  email: string;
  impersonated_by?: string;  // add this
}
```

### 1.2 — Add `getProviderCafes` to controller

File: `rcfeild-be/src/controllers/provider-onboarding.controller.ts`

```typescript
export const getProviderCafes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const cafes = await AppDataSource.getRepository(Cafe).find({
      where: { providerId: id, deletedAt: IsNull() },
      select: ['id', 'name', 'address', 'status'],
    });
    res.json({ data: cafes });
  } catch (err) {
    next(err);
  }
};
```

### 1.3 — Add `impersonateProvider` to controller

File: `rcfeild-be/src/controllers/provider-onboarding.controller.ts`

```typescript
export const impersonateProvider = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const adminId = (req as AuthRequest).user.userId;

    const profile = await AppDataSource.getRepository(ProviderProfile).findOne({
      where: { userId: id },
    });
    if (!profile) throw new AppError('Provider not found', 404, 'PROVIDER_NOT_FOUND');
    if (profile.registrationStatus !== RegistrationStatus.ACTIVE) {
      throw new AppError('Impersonation is only allowed for ACTIVE providers', 400, 'PROVIDER_NOT_ACTIVE');
    }

    const providerUser = await AppDataSource.getRepository(User).findOne({ where: { id } });
    if (!providerUser) throw new AppError('Provider not found', 404, 'PROVIDER_NOT_FOUND');

    const payload: AuthPayload = {
      userId: providerUser.id,
      role: UserRole.PROVIDER,
      email: providerUser.email,
      impersonated_by: adminId,
    };

    const token = jwt.sign(payload, env.jwt.secret, { expiresIn: '2h' });

    res.json({
      token,
      expires_in: 7200,
      provider: { id: providerUser.id, business_name: profile.businessName },
    });
  } catch (err) {
    next(err);
  }
};
```

### 1.4 — Register routes

File: `rcfeild-be/src/routes/admin-provider.routes.ts`

```typescript
router.get('/:id/cafes', authenticate, authorize(UserRole.ADMIN), getProviderCafes);
router.post('/:id/impersonate', authenticate, authorize(UserRole.ADMIN), impersonateProvider);
```

---

## Phase 2: Frontend Foundation

### 2.1 — Add `adminAuth` storage key

File: `rcfield-fe/src/shared/lib/storage.ts`

```typescript
export const storageKeys = {
  auth: 'rcfield.auth',
  adminAuth: 'rcfield.admin_auth',  // add this
  lastEmail: 'rcfield.last_email',
  rememberMe: 'rcfield.remember_me',
};
```

### 2.2 — Extend `authStore` with impersonation state

File: `rcfield-fe/src/features/auth/stores/auth.store.ts`

```typescript
interface ImpersonationState {
  providerUserId: string;
  providerName: string;
}

// Add to store state:
impersonation: ImpersonationState | null;

// Add actions:
startImpersonation: (state: ImpersonationState) => void;
exitImpersonation: () => void;
```

Implementation:
```typescript
startImpersonation: (imp) => set({ impersonation: imp }),
exitImpersonation: () => set({ impersonation: null }),
```

### 2.3 — Modify Axios 401 handler

File: `rcfield-fe/src/shared/lib/axios.ts`

In the response interceptor, before the current "logout and redirect to login" logic:

```typescript
if (error.response?.status === 401) {
  const adminToken = localStorage.getItem(storageKeys.adminAuth);
  if (adminToken) {
    // Graceful exit from impersonation — restore admin session
    localStorage.setItem(storageKeys.auth, adminToken);
    localStorage.removeItem(storageKeys.adminAuth);
    useAuthStore.getState().exitImpersonation();
    // Re-initialize auth from restored token
    // Navigate to admin providers list (no providerId context in interceptor)
    window.location.href = '/admin/providers';
    return Promise.reject(error);
  }
  // Original logout logic here
}
```

### 2.4 — Bypass `ProviderStatusGuard` when impersonating

File: `rcfield-fe/src/shared/components/ProviderStatusGuard.tsx`

At the top of the component (before any useEffect or API calls):

```typescript
const impersonation = useAuthStore((s) => s.impersonation);
if (impersonation) return <>{children}</>;
```

---

## Phase 3: Frontend Components & Pages

### 3.1 — Create `ImpersonationBanner`

File: `rcfield-fe/src/shared/components/ImpersonationBanner.tsx`

```tsx
export function ImpersonationBanner() {
  const { impersonation, exitImpersonation } = useAuthStore();
  const navigate = useNavigate();

  if (!impersonation) return null;

  const handleExit = () => {
    const adminToken = localStorage.getItem(storageKeys.adminAuth);
    if (adminToken) {
      localStorage.setItem(storageKeys.auth, adminToken);
      localStorage.removeItem(storageKeys.adminAuth);
    }
    exitImpersonation();
    navigate(`/admin/providers/${impersonation.providerUserId}`);
  };

  return (
    <div className="sticky top-0 z-50 bg-orange-500 text-white px-4 py-2 flex items-center justify-between">
      <span>Đang truy cập với tư cách: <strong>{impersonation.providerName}</strong></span>
      <button onClick={handleExit} className="underline font-semibold">Thoát</button>
    </div>
  );
}
```

### 3.2 — Add banner to `DashboardLayout`

File: `rcfield-fe/src/app/layouts/DashboardLayout.tsx`

```tsx
import { ImpersonationBanner } from '@/shared/components/ImpersonationBanner';

export function DashboardLayout() {
  return (
    <div>
      <ImpersonationBanner />
      <Outlet />
    </div>
  );
}
```

### 3.3 — Add `adminProviderDetail` route path

File: `rcfield-fe/src/app/router/route-paths.ts`

```typescript
adminProviderDetail: '/admin/providers/:providerId',
```

### 3.4 — Register route

File: `rcfield-fe/src/app/router/routes.tsx`

```tsx
{
  path: routePaths.adminProviderDetail,
  element: <AdminProviderDetailPage />,
}
```

### 3.5 — Add row click to providers list

File: `rcfield-fe/src/pages/admin/AdminProvidersPage.tsx`

```tsx
const navigate = useNavigate();
// On table row:
<tr onClick={() => navigate(`/admin/providers/${provider.id}`)} className="cursor-pointer hover:bg-gray-50">
```

### 3.6 — Create `AdminProviderDetailPage`

File: `rcfield-fe/src/pages/admin/AdminProviderDetailPage.tsx`

Page structure:
1. `const { providerId } = useParams()`
2. Two parallel queries:
   - `useQuery(['providerDetail', providerId], () => adminApi.getProviderDetail(providerId))`
   - `useQuery(['providerCafes', providerId], () => adminApi.getProviderCafes(providerId))`
3. Sections: Account Info → Business Info → Status Badge + Action Buttons → Subscription Info → Cafes List
4. "Truy cập với tư cách Provider" button (only when `detail.registration_status === 'ACTIVE'`):

```typescript
const handleImpersonate = async () => {
  const resp = await adminApi.impersonateProvider(providerId);
  // Save current admin token
  const currentToken = localStorage.getItem(storageKeys.auth);
  localStorage.setItem(storageKeys.adminAuth, currentToken!);
  // Set impersonation token
  localStorage.setItem(storageKeys.auth, resp.token);
  // Update auth store
  startImpersonation({
    providerUserId: resp.provider.id,
    providerName: resp.provider.business_name,
  });
  navigate('/provider/dashboard');
};
```

---

## Integration Test Checklist

- [ ] `GET /admin/providers/:id/cafes` returns array (empty OK)
- [ ] `POST /admin/providers/:id/impersonate` returns token with correct payload
- [ ] Token rejected for non-ACTIVE provider (400 `PROVIDER_NOT_ACTIVE`)
- [ ] Non-admin cannot call impersonate (403)
- [ ] After impersonation: axios uses impersonation token (check Network tab)
- [ ] Banner visible on `/provider/dashboard`, `/provider/cafes`, other provider pages
- [ ] "Thoát" → returns to `/admin/providers/:providerId`, banner gone
- [ ] F5 during impersonation → token persists, banner re-renders from store init
- [ ] Token expires (mock `exp = now - 1`) → auto-exit to admin, not full logout
