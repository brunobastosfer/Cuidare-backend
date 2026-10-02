import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../../common/types/request.types';
import type { UploadedDocumentFile } from '../../domain/models/document.model';
import { documentView } from '../../presentation/views/document.view';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';
import { DocumentUploadGuard } from './document-upload.guard';
import { DocumentIoInterceptor } from './document-io.interceptor';
const uuid = new ParseUUIDPipe({ version: '4' });
@ApiTags('Documentos')
@ApiBearerAuth()
@Controller('dependents/:dependentId/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(DocumentUploadGuard)
  @UseInterceptors(DocumentIoInterceptor, FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'category', 'title'],
      additionalProperties: false,
      properties: {
        file: { type: 'string', format: 'binary' },
        category: {
          type: 'string',
          enum: [
            'PRESCRIPTION',
            'MEDICAL_REPORT',
            'EXAM',
            'MEDICAL_CERTIFICATE',
            'SCHOOL_REPORT',
            'VACCINE_RECORD',
            'OTHER',
          ],
        },
        title: { type: 'string', maxLength: 160 },
        description: { type: 'string', maxLength: 2000 },
        documentDate: { type: 'string', format: 'date' },
      },
    },
  })
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file: UploadedDocumentFile | undefined,
  ) {
    return documentView(await this.documents.upload(user.id, dependentId, dto, file));
  }
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Query() pagination: PaginationDto,
  ) {
    return (await this.documents.list(user.id, dependentId, pagination)).map(documentView);
  }
  @Get(':id')
  async find(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    return documentView(await this.documents.find(user.id, dependentId, id));
  }
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return documentView(await this.documents.update(user.id, dependentId, id, dto));
  }
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    await this.documents.delete(user.id, dependentId, id);
  }
  @Get(':id/content')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(DocumentIoInterceptor)
  @ApiOperation({ summary: 'Baixar conteúdo privado autorizado como attachment; acesso auditado' })
  async content(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { row, bytes } = await this.documents.download(user.id, dependentId, id);
    const extension =
      row.mimeType === 'application/pdf' ? 'pdf' : row.mimeType === 'image/png' ? 'png' : 'jpg';
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    return new StreamableFile(bytes, {
      type: row.mimeType,
      disposition: 'attachment; filename="document-' + row.id + '.' + extension + '"',
      length: bytes.length,
    });
  }
}
