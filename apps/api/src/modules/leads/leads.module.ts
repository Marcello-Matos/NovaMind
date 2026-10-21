import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateLeadDto, UpdateLeadDto } from './dto/lead.dto';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
  ) {}

  async create(userId: string, dto: CreateLeadDto) {
    await this.organizations.assertMembership(userId, dto.organizationId);
    return this.prisma.lead.create({ data: dto });
  }

  async list(userId: string, organizationId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    return this.prisma.lead.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(userId: string, id: string, dto: UpdateLeadDto) {
    const lead = await this.findAuthorized(userId, id);
    return this.prisma.lead.update({
      where: { id: lead.id },
      data: dto,
    });
  }

  async remove(userId: string, id: string) {
    const lead = await this.findAuthorized(userId, id);
    await this.prisma.lead.delete({ where: { id: lead.id } });
    return { deleted: true };
  }

  private async findAuthorized(userId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organization: { members: { some: { userId } } } },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    return lead;
  }
}

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeadDto) {
    return this.leads.create(user.id, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId: string,
  ) {
    return this.leads.list(user.id, organizationId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leads.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leads.remove(user.id, id);
  }
}

@Module({
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
