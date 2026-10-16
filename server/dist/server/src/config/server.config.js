"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVER_CONFIG = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '../.env' });
exports.SERVER_CONFIG = {
    PORT: Number(process.env.PORT) || 4000,
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    PLATFORM_API_URL: process.env.PLATFORM_API_URL || 'https://api.start.ng/v1',
    USE_MOCK_PLATFORM: process.env.USE_MOCK_PLATFORM !== 'false'
};
