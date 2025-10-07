
declare module 'multer';
declare module 'node-cron';

declare global {
  namespace Express {
    interface Request {
      file?: {
        fieldname?: string;
        originalname?: string;
        encoding?: string;
        mimetype?: string;
        buffer?: Buffer;
        size?: number;
      };
      files?: any;
    }
  }
}
export {};
