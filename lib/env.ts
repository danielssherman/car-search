import dotenv from "dotenv";
import path from "path";

const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env.local") });
dotenv.config({ path: path.join(root, ".env") });
