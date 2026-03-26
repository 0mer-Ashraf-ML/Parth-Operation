import { configureStore, combineReducers } from "@reduxjs/toolkit";
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from "redux-persist";
import storage from "redux-persist/lib/storage";
import authReducer from "./authSlice";
import clientsReducer from "./clientsSlice";
import vendorsReducer from "./vendorsSlice";
import usersReducer from "./usersSlice";
import skusReducer from "./skusSlice";
import salesOrdersReducer from "./salesOrdersSlice";
import purchaseOrdersReducer from "./purchaseOrdersSlice";

const rootReducer = combineReducers({
  auth: authReducer,
  clients: clientsReducer,
  vendors: vendorsReducer,
  users: usersReducer,
  skus: skusReducer,
  salesOrders: salesOrdersReducer,
  purchaseOrders: purchaseOrdersReducer,
});

const persistConfig = {
  key: "root",
  storage,
  whitelist: ["auth"], // Only persist auth state
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Initialize API client with store dispatch to break circular dependency
// Use setTimeout to ensure this runs after all modules are loaded

