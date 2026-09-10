// Maximum items accepted by a single bulk-add mutation. Clients chunk larger
// lists into calls of this size; the server rejects anything above it.
export const UPLOAD_CHUNK_SIZE = 500;
