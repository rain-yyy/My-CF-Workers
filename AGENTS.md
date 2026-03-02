# AGENTS.md

This file contains guidelines for AI agents working in this Cloudflare Workers repository.

## Project Structure

This is a multi-project repository containing:
- `Word_Image_Extractor/` - Next.js frontend application for extracting images from Word documents
- `smartplay-monitor/` - Cloudflare Worker for monitoring sports venue availability

## Build Commands

### Word Image Extractor (Next.js)
```bash
# Navigate to frontend directory
cd Word_Image_Extractor/frontend

# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Lint code
npm run lint
```

### SmartPlay Monitor (Cloudflare Worker)
```bash
# Navigate to worker directory
cd smartplay-monitor/worker

# Deploy to Cloudflare Workers (requires Wrangler CLI)
wrangler deploy

# Preview locally
wrangler dev
```

## Testing

Currently no test framework is configured. When adding tests:
- Use Jest for React/Next.js components
- Use Vitest for faster testing if preferred
- For Cloudflare Workers, use the built-in testing approach with `wrangler dev`

## Code Style Guidelines

### TypeScript/JavaScript
- **Strict TypeScript**: All projects use strict TypeScript mode
- **Import Style**: Use ES6 imports with consistent ordering
  - External libraries first
  - Internal modules second
  - Relative imports last
- **Naming Conventions**:
  - Components: PascalCase (`Button`, `Card`)
  - Functions/Variables: camelCase (`handleSubmit`, `isLoading`)
  - Constants: UPPER_SNAKE_CASE (`API_ENDPOINT`, `ACCEPTED_EXT`)
  - Files: kebab-case for utilities (`button.tsx`), PascalCase for components

### React/Next.js Specific
- **Components**: Use functional components with hooks
- **Type Safety**: Always provide proper TypeScript types for props
- **Forward Ref**: Use `forwardRef` for components that need ref forwarding
- **Client Components**: Mark with `"use client"` directive when using browser APIs
- **CSS**: Use Tailwind CSS classes, avoid inline styles

### File Organization
```
components/
  ui/           # Reusable UI components
  feature/      # Feature-specific components
lib/            # Utility functions and configurations
app/            # Next.js App Router pages and layouts
```

### Error Handling
- Use try-catch blocks for async operations
- Provide meaningful error messages to users
- Log errors to console for debugging
- Use proper error boundaries in React apps

### Cloudflare Workers Specific
- **Environment Variables**: Access via `env` parameter
- **KV Storage**: Use `env.KV_NAMESPACE.get()` and `put()`
- **CORS**: Handle OPTIONS preflight requests
- **Response Headers**: Always include proper CORS headers
- **Error Responses**: Return JSON with consistent error format

### Code Formatting
- Use 2 spaces for indentation
- Prefer arrow functions for callbacks
- Keep lines under 100 characters when possible
- Add JSDoc comments for complex functions

### Security Best Practices
- Never commit secrets or API keys
- Validate all input parameters
- Use environment variables for configuration
- Sanitize user inputs before processing

### Performance
- Use React.memo for expensive components
- Implement proper loading states
- Optimize images and assets
- Use caching strategies in Workers

## Dependencies

### Frontend (Word Image Extractor)
- **Framework**: Next.js 14 with App Router
- **UI**: Tailwind CSS for styling
- **Icons**: Lucide React
- **TypeScript**: Strict mode enabled

### Worker (SmartPlay Monitor)
- **Runtime**: Cloudflare Workers
- **Storage**: KV for caching
- **External APIs**: SmartPlay HK API
- **Notifications**: Discord webhooks

## Development Notes

- The Word Image Extractor uses Chinese language in UI and comments
- SmartPlay Monitor handles HK timezone (UTC+8) for scheduling
- Both projects follow modern JavaScript/TypeScript practices
- Prefer async/await over Promise chains
- Use proper TypeScript types instead of `any`

## When Making Changes

1. Always run the lint command before committing
2. Test changes in development mode first
3. Follow existing code patterns and conventions
4. Add proper error handling for new features
5. Update documentation if adding new commands or workflows