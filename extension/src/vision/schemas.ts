import { FEATURE_SCHEMA } from './features';
import { FEATURE_SCHEMA_V2 } from './features-v2';
export type FeatureSchema = typeof FEATURE_SCHEMA | typeof FEATURE_SCHEMA_V2;
export const featureCount = (schema: FeatureSchema) => schema === FEATURE_SCHEMA_V2 ? 172 : 161;
export const isFeatureSchema = (value: unknown): value is FeatureSchema => value === FEATURE_SCHEMA || value === FEATURE_SCHEMA_V2;
