import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { AdminStats, AdminUserInput, AdminUserUpdate, HealthStatus, LoginInput, LoginResponse, OkResult, PriceRule, PricingInput, RequestRide, Ride, User } from "./api.schemas";
import { customFetch } from "../custom-fetch";
import type { ErrorType, BodyType } from "../custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
/**
 * Returns server health status
 * @summary Health check
 */
export declare const getHealthCheckUrl: () => string;
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Request a ride
 */
export declare const getRequestRideUrl: () => string;
export declare const requestRide: (requestRide: RequestRide, options?: RequestInit) => Promise<Ride>;
export declare const getRequestRideMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof requestRide>>, TError, {
        data: BodyType<RequestRide>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof requestRide>>, TError, {
    data: BodyType<RequestRide>;
}, TContext>;
export type RequestRideMutationResult = NonNullable<Awaited<ReturnType<typeof requestRide>>>;
export type RequestRideMutationBody = BodyType<RequestRide>;
export type RequestRideMutationError = ErrorType<unknown>;
/**
 * @summary Request a ride
 */
export declare const useRequestRide: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof requestRide>>, TError, {
        data: BodyType<RequestRide>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof requestRide>>, TError, {
    data: BodyType<RequestRide>;
}, TContext>;
/**
 * @summary Sign in with phone and password
 */
export declare const getLoginUserUrl: () => string;
export declare const loginUser: (loginInput: LoginInput, options?: RequestInit) => Promise<LoginResponse>;
export declare const getLoginUserMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof loginUser>>, TError, {
        data: BodyType<LoginInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof loginUser>>, TError, {
    data: BodyType<LoginInput>;
}, TContext>;
export type LoginUserMutationResult = NonNullable<Awaited<ReturnType<typeof loginUser>>>;
export type LoginUserMutationBody = BodyType<LoginInput>;
export type LoginUserMutationError = ErrorType<void>;
/**
 * @summary Sign in with phone and password
 */
export declare const useLoginUser: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof loginUser>>, TError, {
        data: BodyType<LoginInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof loginUser>>, TError, {
    data: BodyType<LoginInput>;
}, TContext>;
/**
 * @summary Sign out the current session
 */
export declare const getLogoutUserUrl: () => string;
export declare const logoutUser: (options?: RequestInit) => Promise<OkResult>;
export declare const getLogoutUserMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof logoutUser>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof logoutUser>>, TError, void, TContext>;
export type LogoutUserMutationResult = NonNullable<Awaited<ReturnType<typeof logoutUser>>>;
export type LogoutUserMutationError = ErrorType<unknown>;
/**
 * @summary Sign out the current session
 */
export declare const useLogoutUser: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof logoutUser>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof logoutUser>>, TError, void, TContext>;
/**
 * @summary Read operational statistics
 */
export declare const getGetAdminStatsUrl: () => string;
export declare const getAdminStats: (options?: RequestInit) => Promise<AdminStats>;
export declare const getGetAdminStatsQueryKey: () => readonly ["/api/admin/stats"];
export declare const getGetAdminStatsQueryOptions: <TData = Awaited<ReturnType<typeof getAdminStats>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAdminStats>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAdminStatsQueryResult = NonNullable<Awaited<ReturnType<typeof getAdminStats>>>;
export type GetAdminStatsQueryError = ErrorType<void>;
/**
 * @summary Read operational statistics
 */
export declare function useGetAdminStats<TData = Awaited<ReturnType<typeof getAdminStats>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary List client and driver accounts for administration
 */
export declare const getListUsersUrl: () => string;
export declare const listUsers: (options?: RequestInit) => Promise<User[]>;
export declare const getListUsersQueryKey: () => readonly ["/api/users"];
export declare const getListUsersQueryOptions: <TData = Awaited<ReturnType<typeof listUsers>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listUsers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListUsersQueryResult = NonNullable<Awaited<ReturnType<typeof listUsers>>>;
export type ListUsersQueryError = ErrorType<void>;
/**
 * @summary List client and driver accounts for administration
 */
export declare function useListUsers<TData = Awaited<ReturnType<typeof listUsers>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary List rides visible to the authenticated account
 */
export declare const getListRidesUrl: () => string;
export declare const listRides: (options?: RequestInit) => Promise<Ride[]>;
export declare const getListRidesQueryKey: () => readonly ["/api/rides"];
export declare const getListRidesQueryOptions: <TData = Awaited<ReturnType<typeof listRides>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listRides>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listRides>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListRidesQueryResult = NonNullable<Awaited<ReturnType<typeof listRides>>>;
export type ListRidesQueryError = ErrorType<unknown>;
/**
 * @summary List rides visible to the authenticated account
 */
export declare function useListRides<TData = Awaited<ReturnType<typeof listRides>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listRides>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create a user account
 */
export declare const getCreateAdminUserUrl: () => string;
export declare const createAdminUser: (adminUserInput: AdminUserInput, options?: RequestInit) => Promise<User>;
export declare const getCreateAdminUserMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createAdminUser>>, TError, {
        data: BodyType<AdminUserInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createAdminUser>>, TError, {
    data: BodyType<AdminUserInput>;
}, TContext>;
export type CreateAdminUserMutationResult = NonNullable<Awaited<ReturnType<typeof createAdminUser>>>;
export type CreateAdminUserMutationBody = BodyType<AdminUserInput>;
export type CreateAdminUserMutationError = ErrorType<void>;
/**
 * @summary Create a user account
 */
export declare const useCreateAdminUser: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createAdminUser>>, TError, {
        data: BodyType<AdminUserInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createAdminUser>>, TError, {
    data: BodyType<AdminUserInput>;
}, TContext>;
/**
 * @summary Update a user account
 */
export declare const getUpdateAdminUserUrl: (id: string) => string;
export declare const updateAdminUser: (id: string, adminUserUpdate: AdminUserUpdate, options?: RequestInit) => Promise<User>;
export declare const getUpdateAdminUserMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateAdminUser>>, TError, {
        id: string;
        data: BodyType<AdminUserUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateAdminUser>>, TError, {
    id: string;
    data: BodyType<AdminUserUpdate>;
}, TContext>;
export type UpdateAdminUserMutationResult = NonNullable<Awaited<ReturnType<typeof updateAdminUser>>>;
export type UpdateAdminUserMutationBody = BodyType<AdminUserUpdate>;
export type UpdateAdminUserMutationError = ErrorType<void>;
/**
 * @summary Update a user account
 */
export declare const useUpdateAdminUser: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateAdminUser>>, TError, {
        id: string;
        data: BodyType<AdminUserUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateAdminUser>>, TError, {
    id: string;
    data: BodyType<AdminUserUpdate>;
}, TContext>;
/**
 * @summary Delete a non-admin user account
 */
export declare const getDeleteAdminUserUrl: (id: string) => string;
export declare const deleteAdminUser: (id: string, options?: RequestInit) => Promise<OkResult>;
export declare const getDeleteAdminUserMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteAdminUser>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteAdminUser>>, TError, {
    id: string;
}, TContext>;
export type DeleteAdminUserMutationResult = NonNullable<Awaited<ReturnType<typeof deleteAdminUser>>>;
export type DeleteAdminUserMutationError = ErrorType<void>;
/**
 * @summary Delete a non-admin user account
 */
export declare const useDeleteAdminUser: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteAdminUser>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteAdminUser>>, TError, {
    id: string;
}, TContext>;
/**
 * @summary List pricing rules
 */
export declare const getListPricingUrl: () => string;
export declare const listPricing: (options?: RequestInit) => Promise<PriceRule[]>;
export declare const getListPricingQueryKey: () => readonly ["/api/pricing"];
export declare const getListPricingQueryOptions: <TData = Awaited<ReturnType<typeof listPricing>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPricing>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listPricing>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListPricingQueryResult = NonNullable<Awaited<ReturnType<typeof listPricing>>>;
export type ListPricingQueryError = ErrorType<unknown>;
/**
 * @summary List pricing rules
 */
export declare function useListPricing<TData = Awaited<ReturnType<typeof listPricing>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPricing>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create or update a pricing rule
 */
export declare const getUpsertPricingUrl: () => string;
export declare const upsertPricing: (pricingInput: PricingInput, options?: RequestInit) => Promise<PriceRule>;
export declare const getUpsertPricingMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof upsertPricing>>, TError, {
        data: BodyType<PricingInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof upsertPricing>>, TError, {
    data: BodyType<PricingInput>;
}, TContext>;
export type UpsertPricingMutationResult = NonNullable<Awaited<ReturnType<typeof upsertPricing>>>;
export type UpsertPricingMutationBody = BodyType<PricingInput>;
export type UpsertPricingMutationError = ErrorType<void>;
/**
 * @summary Create or update a pricing rule
 */
export declare const useUpsertPricing: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof upsertPricing>>, TError, {
        data: BodyType<PricingInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof upsertPricing>>, TError, {
    data: BodyType<PricingInput>;
}, TContext>;
/**
 * @summary Delete a pricing rule
 */
export declare const getDeletePricingUrl: (id: string) => string;
export declare const deletePricing: (id: string, options?: RequestInit) => Promise<OkResult>;
export declare const getDeletePricingMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deletePricing>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deletePricing>>, TError, {
    id: string;
}, TContext>;
export type DeletePricingMutationResult = NonNullable<Awaited<ReturnType<typeof deletePricing>>>;
export type DeletePricingMutationError = ErrorType<void>;
/**
 * @summary Delete a pricing rule
 */
export declare const useDeletePricing: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deletePricing>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deletePricing>>, TError, {
    id: string;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map