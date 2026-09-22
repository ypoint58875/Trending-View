import type {
  LocalScreeningJobBatchRequest,
  LocalScreeningJobRequest,
} from "./screening-local-engine-protocol";
import { packMarketBars } from "./screening-worker-bars";

export const LOCAL_SCREENING_BINARY_CONTENT_TYPE =
  "application/vnd.quantscope.screening+binary";

function encodeLocalScreeningRequest(
  request: LocalScreeningJobRequest | LocalScreeningJobBatchRequest,
): ArrayBuffer {
  const packed = packMarketBars(request.bars);
  const header = new TextEncoder().encode(
    JSON.stringify({ ...request, bars: undefined, times: packed.times }),
  );
  const values = new Uint8Array(
    packed.values.buffer,
    packed.values.byteOffset,
    packed.values.byteLength,
  );
  const output = new ArrayBuffer(4 + header.byteLength + values.byteLength);
  const view = new DataView(output);
  view.setUint32(0, header.byteLength, true);
  const bytes = new Uint8Array(output);
  bytes.set(header, 4);
  bytes.set(values, 4 + header.byteLength);
  return output;
}

export function encodeLocalScreeningJobRequest(
  request: LocalScreeningJobRequest,
): ArrayBuffer {
  return encodeLocalScreeningRequest(request);
}

export function encodeLocalScreeningJobBatchRequest(
  request: LocalScreeningJobBatchRequest,
): ArrayBuffer {
  return encodeLocalScreeningRequest(request);
}
