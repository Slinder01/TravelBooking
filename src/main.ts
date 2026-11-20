import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express'; // ADDED
import { join } from 'path'; // ADDED
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(cookieParser());

  // ADDED: serve uploaded images at http://localhost:3000/uploads/<filename>
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  app.setGlobalPrefix('api');
  // 1. Build the OpenAPI configuration document
  const config = new DocumentBuilder()
    .setTitle('Travel Booking API') // Change to your project title
    .setDescription('The backend API documentation for travel booking')
    .setVersion('1.0')
    .addCookieAuth('access_token', {
      type: 'apiKey',
      in: 'cookie',
      name: 'access_token',
    }, 'access_token')
    .build();

  // 2. Create the document factory / document
  const documentFactory = () => SwaggerModule.createDocument(app, config);

  // 3. Setup Swagger UI route (e.g., http://localhost:3000/api)
  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(3000);
}
bootstrap();