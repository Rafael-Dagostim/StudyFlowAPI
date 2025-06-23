import { z } from "zod";

// Auth validation schemas
export const signUpSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters long")
    .max(100, "Name cannot exceed 100 characters")
    .trim(),
  email: z.string().email("Please provide a valid email address").toLowerCase(),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters long")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
    ),
});

export const signInSchema = z.object({
  email: z.string().email("Please provide a valid email address").toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// Project validation schemas
export const createProjectSchema = z.object({
  name: z
    .string()
    .min(2, "Project name must be at least 2 characters long")
    .max(200, "Project name cannot exceed 200 characters")
    .trim(),
  subject: z
    .string()
    .min(2, "Subject must be at least 2 characters long")
    .max(100, "Subject cannot exceed 100 characters")
    .trim(),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters long")
    .max(1000, "Description cannot exceed 1000 characters")
    .trim(),
});

export const updateProjectSchema = z
  .object({
    name: z
      .string()
      .min(2, "Project name must be at least 2 characters long")
      .max(200, "Project name cannot exceed 200 characters")
      .trim()
      .optional(),
    subject: z
      .string()
      .min(2, "Subject must be at least 2 characters long")
      .max(100, "Subject cannot exceed 100 characters")
      .trim()
      .optional(),
    description: z
      .string()
      .min(10, "Description must be at least 10 characters long")
      .max(1000, "Description cannot exceed 1000 characters")
      .trim()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters long")
    .max(100, "Name cannot exceed 100 characters")
    .trim(),
});

// Chat validation schemas
export const chatSchema = z.object({
  message: z
    .string()
    .min(1, "Message cannot be empty")
    .max(5000, "Message cannot exceed 5000 characters")
    .trim(),
  conversationId: z.string().cuid("Invalid conversation ID format").optional(),
});

// Generic ID validation
export const idParamsSchema = z.object({
  id: z.string().cuid("Invalid ID format"),
});

// Document ID params validation
export const docParamsSchema = z.object({
  id: z.string().cuid("Invalid project ID format"),
  docId: z.string().cuid("Invalid document ID format"),
});

// File upload validation
export const fileUploadSchema = z.object({
  files: z
    .array(z.any())
    .min(1, "At least one file must be uploaded")
    .max(10, "Maximum 10 files can be uploaded at once"),
});

// Type exports for use in controllers
export type SignUpData = z.infer<typeof signUpSchema>;
export type SignInData = z.infer<typeof signInSchema>;
export type RefreshTokenData = z.infer<typeof refreshTokenSchema>;
export type CreateProjectData = z.infer<typeof createProjectSchema>;
export type UpdateProjectData = z.infer<typeof updateProjectSchema>;
export type UpdateProfileData = z.infer<typeof updateProfileSchema>;
export type ChatData = z.infer<typeof chatSchema>;
export type IdParams = z.infer<typeof idParamsSchema>;
