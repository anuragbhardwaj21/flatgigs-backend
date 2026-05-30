export type EnvelopeMeta = {
  code: number;
  message: string;
  [key: string]: unknown;
};

export type Envelope<T> = {
  data: T | null;
  success: boolean;
  meta: EnvelopeMeta;
};

export function ok<T>(data: T, meta: Partial<EnvelopeMeta> = {}): Envelope<T> {
  return {
    data,
    success: true,
    meta: {
      code: 200,
      message: "OK",
      ...meta,
    },
  };
}

export function fail(
  code: number,
  message: string,
  meta: Partial<EnvelopeMeta> = {}
): Envelope<null> {
  return {
    data: null,
    success: false,
    meta: {
      code,
      message,
      ...meta,
    },
  };
}
