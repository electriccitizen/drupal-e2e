/**
 * Maps Drupal form display widget types to test fill strategies.
 *
 * The widget type comes from core.entity_form_display.*.yml → content → {field} → type.
 * The field type comes from field.field.*.yml → field_type.
 */

export type FieldStrategyType =
  | 'ckeditor'
  | 'text'
  | 'textarea'
  | 'select'
  | 'boolean'
  | 'media'
  | 'link'
  | 'smartdate'
  | 'cshs'
  | 'radios'
  | 'checkboxes';

/**
 * Map from Drupal widget type → fill strategy.
 * Used for both node-level and paragraph-level fields.
 */
const WIDGET_TYPE_MAP: Record<string, FieldStrategyType> = {
  // Text widgets → CKEditor
  text_textarea_with_summary: 'ckeditor',
  text_textarea: 'ckeditor',

  // Plain text widgets
  string_textfield: 'text',
  string_textarea: 'textarea',

  // Media
  media_library_widget: 'media',

  // Selection widgets
  options_select: 'select',

  // Smart Date
  smartdate_default: 'smartdate',
  smartdate_inline: 'smartdate',

  // CSHS (Client-side Hierarchical Select)
  cshs: 'cshs',
  shs_default: 'cshs',

  // Link
  link_default: 'link',

  // Number
  number: 'text',

  // Boolean
  boolean_checkbox: 'boolean',
};

/**
 * Widget types that are system/admin and should be excluded from test field lists.
 */
const EXCLUDED_WIDGET_TYPES = new Set([
  'metatag_firehose',
  'moderation_state_default',
  'language_select',
  'path',
  'paragraphs',
  'entity_reference_paragraphs',
]);

/**
 * Field names that are system/admin and should be excluded from test field lists.
 */
const EXCLUDED_FIELD_NAMES = new Set([
  'field_metatags',
  'field_domain_access',
  'field_domain_source',
  'field_domain_all_affiliates',
  'langcode',
  'moderation_state',
  'path',
  'status',
  'translation',
  'created',
  'uid',
  'promote',
  'sticky',
  'publish_on',
  'unpublish_on',
  'publish_state',
  'unpublish_state',
  'url_redirects',
]);

/**
 * Resolve a Drupal widget type to a test fill strategy.
 * Returns null if the widget type is unknown or excluded.
 */
export function mapWidgetType(
  widgetType: string,
  fieldType?: string,
  cardinality?: number,
): FieldStrategyType | null {
  if (EXCLUDED_WIDGET_TYPES.has(widgetType)) return null;

  // Special handling for options_buttons: radios (single) vs checkboxes (multiple).
  if (widgetType === 'options_buttons') {
    return cardinality === 1 ? 'radios' : 'checkboxes';
  }

  return WIDGET_TYPE_MAP[widgetType] ?? null;
}

/**
 * Check if a field name should be excluded from test field lists.
 */
export function isExcludedField(fieldName: string): boolean {
  return EXCLUDED_FIELD_NAMES.has(fieldName);
}

/**
 * Check if a widget type represents a paragraph reference field.
 */
export function isParagraphWidget(widgetType: string): boolean {
  return widgetType === 'paragraphs' || widgetType === 'entity_reference_paragraphs';
}
