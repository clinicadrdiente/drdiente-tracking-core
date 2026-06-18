export interface HttpRequest<
  TBody = unknown,
  TQuery = Record<string, string | undefined>,
> {
  body?: TBody;
  query?: TQuery;
  headers?: Record<string, string | undefined>;
}

export interface HttpResponse<TBody = unknown> {
  status: number;
  body: TBody;
}

export interface ErrorBody {
  error: string;
  details?: Record<string, unknown>;
}
