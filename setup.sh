#!/bin/bash
set -e

echo "=== teamver-agent v2 프로젝트 생성 시작 ==="

# Backend 초기화
mkdir -p backend/src/routes backend/src/services backend/src/types

# Backend package.json
cat > backend/package.json << 'EOF'
{
  "name": "teamver-agent-backend",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.36.3",
    "@fastify/cors": "^9.0.1",
    "@fastify/jwt": "^7.0.0",
    "@fastify/multipart": "^8.3.0",
    "@fastify/static": "^7.0.4",
    "bcryptjs": "^2.4.3",
    "pg": "^8.11.3",
    "socket.io": "^4.7.4",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/pg": "^8.11.2",
    "@types/uuid": "^9.0.7",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
EOF

# tsconfig
cat > backend/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
EOF

echo "Backend 설정 완료"
