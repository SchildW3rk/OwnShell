export function formatPostgresDataType(row: {
  data_type: string;
  udt_name: string;
  character_maximum_length?: number;
  numeric_precision?: number;
  numeric_scale?: number;
}): string {
  const { data_type, udt_name, character_maximum_length, numeric_precision, numeric_scale } = row;

  if (data_type === 'ARRAY') {
    return `${udt_name.replace(/^_/, '')}[]`;
  }

  if (character_maximum_length) {
    return `${data_type}(${character_maximum_length})`;
  }

  if (numeric_precision && data_type === 'numeric') {
    return numeric_scale ? `numeric(${numeric_precision},${numeric_scale})` : `numeric(${numeric_precision})`;
  }

  const typeMapping: Record<string, string> = {
    int2: 'smallint',
    int4: 'integer',
    int8: 'bigint',
    float4: 'real',
    float8: 'double precision',
    bool: 'boolean',
    timestamptz: 'timestamp with time zone',
    timetz: 'time with time zone',
  };

  return typeMapping[udt_name] || data_type;
}
