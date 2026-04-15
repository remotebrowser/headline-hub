import {
  type Context,
  type TextMapGetter,
  type TextMapPropagator,
  type TextMapSetter,
  type Span,
  trace,
  SpanKind,
} from '@opentelemetry/api';

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface SessionEntry {
  rootSpan: Span;
  lastAccess: number;
}

const sessionSpans = new Map<string, SessionEntry>();

// Periodically evict expired sessions to prevent memory leaks.
// The root spans are already ended at creation time, so we just drop the map entry.
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of sessionSpans) {
    if (now - entry.lastAccess > SESSION_TTL_MS) {
      sessionSpans.delete(id);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * Propagator that groups all HTTP requests from the same browser session
 * under a single trace by maintaining a long-lived root span per session.
 *
 * The browser sends an `x-browser-trace-id` header (just a hex ID, not a
 * W3C traceparent). On the first request with a given ID we create a real
 * root span; subsequent requests reuse it. The HTTP auto-instrumentation
 * then parents its per-request span under this root, so every request in
 * the session shares the same trace ID in Logfire.
 */
export class BrowserSessionPropagator implements TextMapPropagator {
  extract(ctx: Context, carrier: unknown, getter: TextMapGetter): Context {
    const raw = getter.get(carrier!, 'x-browser-trace-id');
    const browserTraceId = Array.isArray(raw) ? raw[0] : raw;
    if (!browserTraceId) return ctx;

    let entry = sessionSpans.get(browserTraceId);
    if (!entry) {
      const tracer = trace.getTracer('headline-hub');
      const rootSpan = tracer.startSpan('Browser Session', {
        kind: SpanKind.SERVER,
        attributes: {
          'browser_session_trace_id': browserTraceId,
        },
      });
      // End immediately so the span is exported to Logfire right away.
      // The SpanContext (trace ID + span ID) remains valid for parenting
      // child spans even after the span is ended.
      rootSpan.end();
      entry = { rootSpan, lastAccess: Date.now() };
      sessionSpans.set(browserTraceId, entry);
    } else {
      entry.lastAccess = Date.now();
    }

    return trace.setSpan(ctx, entry.rootSpan);
  }

  inject(_ctx: Context, _carrier: unknown, _setter: TextMapSetter): void {
    // Server-side only — nothing to inject.
  }

  fields(): string[] {
    return ['x-browser-trace-id'];
  }
}
