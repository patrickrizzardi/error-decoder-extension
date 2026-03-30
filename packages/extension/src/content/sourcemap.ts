// Source map resolver — resolves minified stack traces to original source
// Fetches .map files from the page's origin (same-origin, no CORS issues)
// Only works in dev where source maps are served

type ResolvedFrame = {
  original: {
    file: string;
    line: number;
    column: number;
  };
  source?: string; // Surrounding source code lines
};

type SourceMapData = {
  version: number;
  sources: string[];
  sourcesContent?: (string | null)[];
  mappings: string;
  names: string[];
};

// Cache fetched source maps
const mapCache = new Map<string, SourceMapData | null>();

// Parse a stack trace and resolve source maps for each frame
export const resolveStackTrace = async (errorText: string): Promise<string> => {
  // Extract stack trace lines with file:line:col references
  const frameRegex = /(?:at\s+.*?\(|at\s+)?(https?:\/\/[^\s:]+|\/[^\s:]+):(\d+):(\d+)/g;
  const frames: Array<{ match: string; url: string; line: number; col: number }> = [];

  let m;
  while ((m = frameRegex.exec(errorText)) !== null) {
    frames.push({
      match: m[0],
      url: m[1],
      line: parseInt(m[2], 10),
      col: parseInt(m[3], 10),
    });
  }

  if (frames.length === 0) return errorText;

  // Resolve each frame (limit to first 5 for performance)
  const resolved: Array<{ frame: typeof frames[0]; resolved: ResolvedFrame | null }> = [];

  for (const frame of frames.slice(0, 5)) {
    try {
      const result = await resolveFrame(frame.url, frame.line, frame.col);
      resolved.push({ frame, resolved: result });
    } catch {
      resolved.push({ frame, resolved: null });
    }
  }

  // Build enriched error text
  let enriched = errorText;
  let sourceSnippets = "";

  for (const { frame, resolved: res } of resolved) {
    if (!res) continue;

    // Add original file mapping
    enriched += `\n  → ${res.original.file}:${res.original.line}:${res.original.column} (resolved from ${frame.url.split("/").pop()})`;

    // Add source code snippet
    if (res.source) {
      sourceSnippets += `\n\nSource: ${res.original.file}:${res.original.line}\n${res.source}`;
    }
  }

  if (sourceSnippets) {
    enriched += "\n\n--- Resolved Source Code ---" + sourceSnippets;
  }

  return enriched;
};

const resolveFrame = async (
  scriptUrl: string,
  line: number,
  col: number
): Promise<ResolvedFrame | null> => {
  const map = await fetchSourceMap(scriptUrl);
  if (!map) return null;

  // Decode the VLQ mappings to find the original position
  const decoded = decodeMappings(map.mappings);
  const originalPos = findOriginalPosition(decoded, line - 1, col - 1);

  if (!originalPos) return null;

  const sourceFile = map.sources[originalPos.sourceIndex] || "unknown";
  const sourceContent = map.sourcesContent?.[originalPos.sourceIndex];

  let sourceSnippet: string | undefined;
  if (sourceContent) {
    sourceSnippet = extractLines(sourceContent, originalPos.line, 3);
  }

  return {
    original: {
      file: sourceFile,
      line: originalPos.line + 1,
      column: originalPos.column,
    },
    source: sourceSnippet,
  };
};

const fetchSourceMap = async (scriptUrl: string): Promise<SourceMapData | null> => {
  if (mapCache.has(scriptUrl)) return mapCache.get(scriptUrl) || null;

  try {
    // First fetch the script to find the sourceMappingURL
    const scriptResponse = await fetch(scriptUrl);
    if (!scriptResponse.ok) {
      mapCache.set(scriptUrl, null);
      return null;
    }

    const scriptText = await scriptResponse.text();

    // Find sourceMappingURL
    const urlMatch = scriptText.match(/\/\/[#@]\s*sourceMappingURL=(.+?)(?:\s|$)/);
    if (!urlMatch) {
      mapCache.set(scriptUrl, null);
      return null;
    }

    let mapUrl = urlMatch[1];

    // Handle data URI source maps
    if (mapUrl.startsWith("data:")) {
      const base64Match = mapUrl.match(/base64,(.+)/);
      if (base64Match) {
        const json = atob(base64Match[1]);
        const map = JSON.parse(json);
        mapCache.set(scriptUrl, map);
        return map;
      }
      mapCache.set(scriptUrl, null);
      return null;
    }

    // Resolve relative URL
    if (!mapUrl.startsWith("http")) {
      const base = scriptUrl.substring(0, scriptUrl.lastIndexOf("/") + 1);
      mapUrl = base + mapUrl;
    }

    // Fetch the .map file
    const mapResponse = await fetch(mapUrl);
    if (!mapResponse.ok) {
      mapCache.set(scriptUrl, null);
      return null;
    }

    const map = await mapResponse.json();
    mapCache.set(scriptUrl, map);
    return map;
  } catch {
    mapCache.set(scriptUrl, null);
    return null;
  }
};

// Extract lines around a target line for context
const extractLines = (source: string, targetLine: number, context: number): string => {
  const lines = source.split("\n");
  const start = Math.max(0, targetLine - context);
  const end = Math.min(lines.length - 1, targetLine + context);

  return lines
    .slice(start, end + 1)
    .map((line, i) => {
      const lineNum = start + i + 1;
      const marker = lineNum === targetLine + 1 ? "→" : " ";
      return `${marker} ${String(lineNum).padStart(4)} | ${line}`;
    })
    .join("\n");
};

// ============================================
// VLQ Source Map Decoding (simplified)
// ============================================

type MappingSegment = {
  generatedColumn: number;
  sourceIndex: number;
  line: number;
  column: number;
};

const VLQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const decodeVLQ = (encoded: string): number[] => {
  const values: number[] = [];
  let shift = 0;
  let value = 0;

  for (const char of encoded) {
    const digit = VLQ_CHARS.indexOf(char);
    if (digit === -1) continue;

    const cont = digit & 32;
    value += (digit & 31) << shift;

    if (cont) {
      shift += 5;
    } else {
      const isNegative = value & 1;
      value >>= 1;
      values.push(isNegative ? -value : value);
      value = 0;
      shift = 0;
    }
  }

  return values;
};

const decodeMappings = (mappings: string): MappingSegment[][] => {
  const lines = mappings.split(";");
  const decoded: MappingSegment[][] = [];

  let sourceIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;

  for (const line of lines) {
    const segments: MappingSegment[] = [];
    let generatedColumn = 0;

    if (line) {
      for (const segment of line.split(",")) {
        const values = decodeVLQ(segment);
        if (values.length >= 4) {
          generatedColumn += values[0];
          sourceIndex += values[1];
          sourceLine += values[2];
          sourceColumn += values[3];

          segments.push({
            generatedColumn,
            sourceIndex,
            line: sourceLine,
            column: sourceColumn,
          });
        } else if (values.length >= 1) {
          generatedColumn += values[0];
        }
      }
    }

    decoded.push(segments);
  }

  return decoded;
};

const findOriginalPosition = (
  decoded: MappingSegment[][],
  line: number,
  column: number
): { sourceIndex: number; line: number; column: number } | null => {
  if (line >= decoded.length) return null;

  const segments = decoded[line];
  if (!segments || segments.length === 0) return null;

  // Find the segment closest to but not exceeding the target column
  let best = segments[0];
  for (const seg of segments) {
    if (seg.generatedColumn <= column) {
      best = seg;
    } else {
      break;
    }
  }

  if (!best) return null;

  return {
    sourceIndex: best.sourceIndex,
    line: best.line,
    column: best.column,
  };
};
