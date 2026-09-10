import {getReviewSessions} from './reviewProgress';

describe('getReviewSessions', () => {
  beforeEach(() => localStorage.clear());

  it('summarizes file progress by pull request and ignores unrelated data', () => {
    const pathname = '/FreeCAD/FreeCAD/pull/12345';
    localStorage.setItem(
      `reviewstack.commit-files.v1:${pathname}:abc123`,
      JSON.stringify(['src/one.cpp', 'src/two.cpp']),
    );
    localStorage.setItem(
      `reviewstack.commit-files.v1:${pathname}:def456`,
      JSON.stringify(['src/three.cpp']),
    );
    localStorage.setItem(`reviewstack.reviewed.v1:${pathname}:file:abc123:src/one.cpp`, 'true');
    localStorage.setItem('reviewstack.commit-files.v1:invalid', 'not json');

    expect(getReviewSessions()).toEqual([{pathname, viewed: 1, total: 3}]);
  });

  it('ignores malformed progress metadata', () => {
    localStorage.setItem(
      'reviewstack.commit-files.v1:/FreeCAD/FreeCAD/pull/12345:abc123',
      'not json',
    );
    localStorage.setItem('reviewstack.commit-files.v1:/settings:abc123', JSON.stringify(['file']));

    expect(getReviewSessions()).toEqual([]);
  });
});
