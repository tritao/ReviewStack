import {parseReviewTarget} from './reviewTarget';

test.each([
  ['https://github.com/FreeCAD/FreeCAD/pull/29700', '/FreeCAD/FreeCAD/pull/29700'],
  ['FreeCAD/FreeCAD#29700', '/FreeCAD/FreeCAD/pull/29700'],
  ['FreeCAD/FreeCAD', '/FreeCAD/FreeCAD/pulls'],
  ['not a repository', null],
])('parses %s', (input, expected) => expect(parseReviewTarget(input)).toBe(expected));
