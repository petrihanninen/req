export interface CapturedRequest {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string | null;
  bodyTruncated: boolean;
  contentType: string | null;
  sourceIp: string;
  size: number;
}
