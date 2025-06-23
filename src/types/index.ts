import { Request } from "express";
import { Professor } from "@prisma/client";
import {
  SignUpData,
  SignInData,
  CreateProjectData,
  UpdateProjectData,
  ChatData,
} from "../utils/validation";

// Extend Express Request type to include authenticated user
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

// Auth related types (using Zod-inferred types)
export interface SignUpRequest extends SignUpData {}
export interface SignInRequest extends SignInData {}

export interface AuthResponse {
  professor: {
    id: string;
    name: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
}

// Project related types (using Zod-inferred types)
export interface CreateProjectRequest extends CreateProjectData {}
export interface UpdateProjectRequest extends UpdateProjectData {}
