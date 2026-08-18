export class GoogleApiHttpError extends Error {
  readonly status: number;
  readonly code: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GoogleApiHttpError";
    this.status = status;
    this.code = status;
  }
}
