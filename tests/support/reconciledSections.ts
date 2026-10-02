import { storedSections } from './storedJson';

export const sectionsOf = (result: { sections: unknown[] }) => storedSections.parse(result.sections);
