import { readImageUploadFile } from "./mcpImageUploadFiles";
import { decodeMcpUploadPng } from "./mcpImageUploadPng";
import {
  composeExternalBackgroundRaster,
  composeExternalLetteringRaster,
} from "./mcpExternalImageRaster";
import type {
  McpImageWorkerRequest,
  McpImageWorkerResponse,
} from "./mcpImageWorkerProtocol";

export async function executeMcpImageWorkerRequest(
  request: McpImageWorkerRequest,
): Promise<Exclude<McpImageWorkerResponse, { error: unknown }>> {
  switch (request.kind) {
    case "validate": {
      const { path, declared } = request.input;
      const input = await readImageUploadFile(
        path,
        declared.bytes,
        declared.sha256,
      );
      const { hasTransparency, selectedPixels } = decodeMcpUploadPng(
        input,
        declared,
      );
      return {
        id: request.id,
        kind: request.kind,
        result: { hasTransparency, selectedPixels },
      };
    }
    case "lettering":
      return {
        id: request.id,
        kind: request.kind,
        result: composeExternalLetteringRaster(request.input),
      };
    case "background":
      return {
        id: request.id,
        kind: request.kind,
        result: composeExternalBackgroundRaster(request.input),
      };
  }
}
