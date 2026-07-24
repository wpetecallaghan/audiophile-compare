export type HttpStatus = 200 | 201 | 400 | 401 | 403 | 404 | 409 | 500 | 502

export const HTTP_OK: HttpStatus = 200
export const HTTP_CREATED: HttpStatus = 201
export const HTTP_BAD_REQUEST: HttpStatus = 400
export const HTTP_UNAUTHORIZED: HttpStatus = 401
export const HTTP_FORBIDDEN: HttpStatus = 403
export const HTTP_NOT_FOUND: HttpStatus = 404
export const HTTP_CONFLICT: HttpStatus = 409
export const HTTP_INTERNAL_SERVER_ERROR: HttpStatus = 500
export const HTTP_BAD_GATEWAY: HttpStatus = 502
