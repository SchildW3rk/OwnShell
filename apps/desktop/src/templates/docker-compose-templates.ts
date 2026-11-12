/**
 * Docker Compose Templates
 *
 * Pre-configured docker-compose.yml templates for common application stacks
 */

export interface ComposeTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const composeTemplates: ComposeTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Empty template to start from scratch',
    content: `version: '3.8'

services:
  # Define your services here
`,
  },
  {
    id: 'wordpress',
    name: 'WordPress + MySQL',
    description: 'WordPress CMS with MySQL database',
    content: `version: '3.8'

services:
  wordpress:
    image: wordpress:latest
    container_name: wordpress
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      WORDPRESS_DB_HOST: mysql:3306
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress_password
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wordpress_data:/var/www/html
    depends_on:
      - mysql
    networks:
      - wordpress_network

  mysql:
    image: mysql:8.0
    container_name: mysql
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: wordpress_password
      MYSQL_ROOT_PASSWORD: root_password
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - wordpress_network

volumes:
  wordpress_data:
  mysql_data:

networks:
  wordpress_network:
    driver: bridge
`,
  },
  {
    id: 'nginx-php',
    name: 'Nginx + PHP-FPM + MySQL',
    description: 'LEMP stack for custom PHP applications',
    content: `version: '3.8'

services:
  nginx:
    image: nginx:alpine
    container_name: nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./app:/var/www/html
      - ./nginx/conf.d:/etc/nginx/conf.d
    depends_on:
      - php
    networks:
      - lemp_network

  php:
    image: php:8.2-fpm-alpine
    container_name: php-fpm
    restart: unless-stopped
    volumes:
      - ./app:/var/www/html
    networks:
      - lemp_network

  mysql:
    image: mysql:8.0
    container_name: mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: app_db
      MYSQL_USER: app_user
      MYSQL_PASSWORD: app_password
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - lemp_network

  phpmyadmin:
    image: phpmyadmin/phpmyadmin
    container_name: phpmyadmin
    restart: unless-stopped
    ports:
      - "8081:80"
    environment:
      PMA_HOST: mysql
      PMA_PORT: 3306
    depends_on:
      - mysql
    networks:
      - lemp_network

volumes:
  mysql_data:

networks:
  lemp_network:
    driver: bridge
`,
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL + pgAdmin',
    description: 'PostgreSQL database with web admin interface',
    content: `version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres_password
      POSTGRES_DB: app_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - postgres_network

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: pgadmin
    restart: unless-stopped
    ports:
      - "5050:80"
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@example.com
      PGADMIN_DEFAULT_PASSWORD: admin_password
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    depends_on:
      - postgres
    networks:
      - postgres_network

volumes:
  postgres_data:
  pgadmin_data:

networks:
  postgres_network:
    driver: bridge
`,
  },
  {
    id: 'mysql',
    name: 'MySQL + phpMyAdmin',
    description: 'MySQL database with web admin interface',
    content: `version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: mysql
    restart: unless-stopped
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: app_db
      MYSQL_USER: app_user
      MYSQL_PASSWORD: app_password
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - mysql_network

  phpmyadmin:
    image: phpmyadmin/phpmyadmin
    container_name: phpmyadmin
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      PMA_HOST: mysql
      PMA_PORT: 3306
      PMA_USER: root
      PMA_PASSWORD: root_password
    depends_on:
      - mysql
    networks:
      - mysql_network

volumes:
  mysql_data:

networks:
  mysql_network:
    driver: bridge
`,
  },
  {
    id: 'redis',
    name: 'Redis + Redis Commander',
    description: 'Redis cache with web management interface',
    content: `version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: redis-server --requirepass redis_password
    volumes:
      - redis_data:/data
    networks:
      - redis_network

  redis-commander:
    image: rediscommander/redis-commander:latest
    container_name: redis-commander
    restart: unless-stopped
    ports:
      - "8081:8081"
    environment:
      REDIS_HOSTS: local:redis:6379:0:redis_password
    depends_on:
      - redis
    networks:
      - redis_network

volumes:
  redis_data:

networks:
  redis_network:
    driver: bridge
`,
  },
  {
    id: 'mongodb',
    name: 'MongoDB + Mongo Express',
    description: 'MongoDB database with web admin interface',
    content: `version: '3.8'

services:
  mongodb:
    image: mongo:7
    container_name: mongodb
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin_password
      MONGO_INITDB_DATABASE: app_db
    volumes:
      - mongodb_data:/data/db
    networks:
      - mongodb_network

  mongo-express:
    image: mongo-express:latest
    container_name: mongo-express
    restart: unless-stopped
    ports:
      - "8081:8081"
    environment:
      ME_CONFIG_MONGODB_ADMINUSERNAME: admin
      ME_CONFIG_MONGODB_ADMINPASSWORD: admin_password
      ME_CONFIG_MONGODB_URL: mongodb://admin:admin_password@mongodb:27017/
      ME_CONFIG_BASICAUTH_USERNAME: admin
      ME_CONFIG_BASICAUTH_PASSWORD: admin
    depends_on:
      - mongodb
    networks:
      - mongodb_network

volumes:
  mongodb_data:

networks:
  mongodb_network:
    driver: bridge
`,
  },
  {
    id: 'nginx-proxy',
    name: 'Nginx Reverse Proxy',
    description: 'Nginx as a reverse proxy with SSL support',
    content: `version: '3.8'

services:
  nginx-proxy:
    image: nginxproxy/nginx-proxy:alpine
    container_name: nginx-proxy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/tmp/docker.sock:ro
      - ./certs:/etc/nginx/certs:ro
      - ./vhost.d:/etc/nginx/vhost.d
      - ./html:/usr/share/nginx/html
    networks:
      - proxy_network

  # Example backend service
  # whoami:
  #   image: traefik/whoami
  #   container_name: whoami
  #   restart: unless-stopped
  #   environment:
  #     VIRTUAL_HOST: whoami.example.com
  #     VIRTUAL_PORT: 80
  #   networks:
  #     - proxy_network

networks:
  proxy_network:
    driver: bridge
`,
  },
];

export function getTemplateById(id: string): ComposeTemplate | undefined {
  return composeTemplates.find((template) => template.id === id);
}

export function getTemplateNames(): string[] {
  return composeTemplates.map((template) => template.name);
}
