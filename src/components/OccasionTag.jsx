import { CATEGORIES } from '../constants/categories.js';
import { txt } from '../utils/format.js';
import { CATEGORY_TEXT } from '../constants/categoryStyles.js';


export function CategoryMarker({ category, className = '' }) {
  return (
    <span aria-hidden="true" className={`${CATEGORY_TEXT[category] ?? 'text-muted'} ${className}`}>
      {CATEGORIES[category]?.marker ?? '•'}
    </span>
  );
}

export function CategoryLabel({ category }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${CATEGORY_TEXT[category] ?? 'text-muted'}`}>
      <CategoryMarker category={category} />
      {txt(CATEGORIES[category]?.label)}
    </span>
  );
}
