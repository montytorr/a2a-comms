// ============================================================
// A2A Comms — Schema Validator
// Converts a stored JSON schema descriptor into a Zod schema
// and validates message content at runtime.
// ============================================================

import { z } from 'zod';

/**
 * JSON schema descriptor format stored in the database.
 *
 * Examples:
 *   { "type": "string" }
 *   { "type": "number" }
 *   { "type": "boolean" }
 *   { "type": "enum", "values": ["ok", "error"] }
 *   { "type": "array", "items": { "type": "string" } }
 *   { "type": "object", "properties": { "status": { "type": "enum", "values": ["ok","error"] }, "data": { "type": "object" } } }
 *
 * Object properties are required by default. Set "optional": true to make them optional.
 */
export interface SchemaDescriptor {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'enum';
  properties?: Record<string, SchemaDescriptor & { optional?: boolean }>;
  items?: SchemaDescriptor;
  values?: string[];
  optional?: boolean;
}

/**
 * Build a Zod schema from a JSON schema descriptor.
 * Throws if the descriptor is malformed.
 */
export function buildZodSchema(descriptor: SchemaDescriptor): z.ZodType {
  switch (descriptor.type) {
    case 'string':
      return z.string();

    case 'number':
      return z.number();

    case 'boolean':
      return z.boolean();

    case 'enum': {
      if (!descriptor.values || !Array.isArray(descriptor.values) || descriptor.values.length === 0) {
        throw new Error('Enum schema requires a non-empty "values" array');
      }
      // z.enum requires at least one value — we validated above
      return z.enum(descriptor.values as [string, ...string[]]);
    }

    case 'array': {
      const itemSchema = descriptor.items ? buildZodSchema(descriptor.items) : z.unknown();
      return z.array(itemSchema);
    }

    case 'object': {
      if (!descriptor.properties || Object.keys(descriptor.properties).length === 0) {
        // Bare "object" — accept any object
        return z.record(z.string(), z.unknown());
      }

      const shape: Record<string, z.ZodType> = {};
      for (const [key, propDescriptor] of Object.entries(descriptor.properties)) {
        let fieldSchema = buildZodSchema(propDescriptor);
        if (propDescriptor.optional) {
          fieldSchema = fieldSchema.optional();
        }
        shape[key] = fieldSchema;
      }
      return z.object(shape);
    }

    default:
      throw new Error(`Unsupported schema type: ${(descriptor as SchemaDescriptor).type}`);
  }
}

/**
 * Validate content against a stored schema descriptor.
 *
 * @returns `{ success: true }` or `{ success: false, error: string }`.
 */
export function validateContent(
  schemaJson: unknown,
  content: unknown,
): { success: true } | { success: false; error: string } {
  try {
    const descriptor = schemaJson as SchemaDescriptor;

    if (!descriptor || typeof descriptor !== 'object' || !descriptor.type) {
      return { success: false, error: 'Invalid schema descriptor: missing "type" field' };
    }

    const zodSchema = buildZodSchema(descriptor);
    const result = zodSchema.safeParse(content);

    if (result.success) {
      return { success: true };
    }

    // Format Zod error issues into a human-readable string
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `at "${issue.path.join('.')}"` : 'at root';
      return `${path}: ${issue.message}`;
    });

    return { success: false, error: `Schema validation failed: ${issues.join('; ')}` };
  } catch (err) {
    return {
      success: false,
      error: `Schema error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
