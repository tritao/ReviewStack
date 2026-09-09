/** A stack configuration error that should be actionable to a PR author. */
export default class StackMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StackMetadataError';
  }
}
