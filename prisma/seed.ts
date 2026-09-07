import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  Availability,
  LegacyCity,
  FormalizationStatus,
  PrismaClient,
  Role,
} from "@prisma/client";

const prisma = new PrismaClient();
import { recalculateProviderTrustScore } from "../src/lib/trust-score-service";

const PASSWORD = "Conecta123!";
const now = new Date("2026-07-07T12:00:00.000Z");

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const locationSeeds = [
  { department: "Managua", city: "Managua", legacyCode: LegacyCity.MANAGUA },
  { department: "León", city: "León", legacyCode: LegacyCity.LEON },
  { department: "Granada", city: "Granada", legacyCode: LegacyCity.GRANADA },
  { department: "Masaya", city: "Masaya", legacyCode: LegacyCity.MASAYA },
  { department: "Estelí", city: "Estelí", legacyCode: LegacyCity.ESTELI },
  { department: "Matagalpa", city: "Matagalpa", legacyCode: LegacyCity.MATAGALPA },
  { department: "RACCS", city: "Bluefields", legacyCode: LegacyCity.BLUEFIELDS },
  { department: "Chontales", city: "Juigalpa", legacyCode: LegacyCity.JUIGALPA },
  { department: "León", city: "Nagarote", legacyCode: LegacyCity.NAGAROTE },
  { department: "Masaya", city: "San Juan de Oriente", legacyCode: LegacyCity.SAN_JUAN_DE_ORIENTE },
] as const;

const users = [
  { id: "seed_user_requester", email: "requester@conecta.test", name: "Andrea Requester", role: Role.USER },
  { id: "seed_user_provider_textil", email: "textil@conecta.test", name: "María Textil", role: Role.PROVIDER },
  { id: "seed_user_provider_empaques", email: "empaques@conecta.test", name: "Carlos Empaques", role: Role.PROVIDER },
  { id: "seed_user_provider_tech", email: "tech@conecta.test", name: "Lucía Tech", role: Role.PROVIDER },
  { id: "seed_user_provider_cafe", email: "cafe@conecta.test", name: "Don Ernesto Café", role: Role.PROVIDER },
  { id: "seed_user_provider_equipo", email: "equipos@conecta.test", name: "Rosa Equipos", role: Role.PROVIDER },
  { id: "seed_user_provider_marketing", email: "marketing@conecta.test", name: "Mateo Marketing", role: Role.PROVIDER },
  { id: "seed_user_admin", email: "admin@conecta.test", name: "Admin Reviewer", role: Role.ADMIN_REVIEWER },
  { id: "seed_user_superadmin", email: "superadmin@conecta.test", name: "Super Admin", role: Role.SUPER_ADMIN },
  { id: "seed_user_provider_draft", email: "draft@conecta.test", name: "Sofía Bordados", role: Role.PROVIDER },
  { id: "seed_user_provider_inactive", email: "inactive@conecta.test", name: "Cajas y Más", role: Role.PROVIDER },
  { id: "seed_user_provider_restricted", email: "restricted@conecta.test", name: "Digital Express", role: Role.PROVIDER },
] as const;

const providerSeeds = [
  {
    id: "seed_provider_textil",
    userId: "seed_user_provider_textil",
    displayName: "Taller Creativo Masaya",
    slug: "taller-creativo-masaya",
    city: LegacyCity.MASAYA,
    category: "Bordado y serigrafía",
    mainCategory: "Textil personalizado",
    shortDescription: "Bordado, camisetas y uniformes para pequeños negocios.",
    aboutDescription: "Taller local especializado en bordado, camisetas personalizadas y uniformes para emprendimientos, colegios y equipos de trabajo.",
    priceRange: "MEDIUM",
    availability: Availability.DISPONIBLE,
    formalizationStatus: FormalizationStatus.EN_PROCESO,
    verified: true,
    verificationLevel: "COMPLETE",
    completedRequests: 18,
    responseTimeHrs: 2,
    lat: 11.9744,
    lng: -86.0944,
    trust: 88,
    image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80",
    medals: ["PERFIL_COMPLETO", "TELEFONO_VERIFICADO", "RESPONDE_RAPIDO", "BUENAS_RESENAS"],
    catalog: [
      { id: "seed_item_textil_camisetas", title: "Camisetas personalizadas", itemType: "PRODUCTO_FINAL", subcategory: "Camisetas", priceMin: 250, priceMax: 400, priceUnit: "unidad" },
      { id: "seed_item_textil_uniformes", title: "Uniformes bordados", itemType: "SERVICIO_ESPECIALIZADO", subcategory: "Uniformes", priceMin: 900, priceMax: 2500, priceUnit: "lote" },
    ],
  },
  {
    id: "seed_provider_empaques",
    userId: "seed_user_provider_empaques",
    displayName: "Empaques Verdes Granada",
    slug: "empaques-verdes-granada",
    city: LegacyCity.GRANADA,
    category: "Empaques ecológicos",
    mainCategory: "Empaques biodegradables",
    shortDescription: "Cajas, etiquetas y bolsas sostenibles para marcas locales.",
    aboutDescription: "Proveedor de empaques responsables para alimentos, café, cosmética artesanal y negocios que quieren mejorar su presentación sin perder identidad local.",
    priceRange: "HIGH",
    availability: Availability.BAJO_PEDIDO,
    formalizationStatus: FormalizationStatus.MIPYME_FORMAL,
    verified: true,
    verificationLevel: "COMPLETE",
    completedRequests: 32,
    responseTimeHrs: 1,
    lat: 11.9344,
    lng: -85.956,
    trust: 95,
    image: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=1200&q=80",
    medals: ["PERFIL_COMPLETO", "MIPYME_FORMAL", "BUENAS_RESENAS", "SOLICITUDES_COMPLETADAS"],
    catalog: [
      { id: "seed_item_empaques_kraft", title: "Empaque kraft personalizado", itemType: "INSUMO", subcategory: "Cajas kraft", priceMin: 4, priceMax: 12, priceUnit: "unidad" },
      { id: "seed_item_empaques_etiquetas", title: "Etiquetas biodegradables", itemType: "MATERIA_PRIMA", subcategory: "Etiquetas", priceMin: 2, priceMax: 8, priceUnit: "unidad" },
    ],
  },
  {
    id: "seed_provider_tech",
    userId: "seed_user_provider_tech",
    displayName: "Nexo Digital Managua",
    slug: "nexo-digital-managua",
    city: LegacyCity.MANAGUA,
    category: "Servicios tecnológicos",
    mainCategory: "Automatización y sitios web",
    shortDescription: "Sitios web, automatización y soporte para emprendimientos.",
    aboutDescription: "Equipo técnico que ayuda a negocios pequeños a crear presencia digital, automatizar procesos sencillos y ordenar su comunicación con clientes.",
    priceRange: "MEDIUM",
    availability: Availability.DISPONIBLE,
    formalizationStatus: FormalizationStatus.EN_PROCESO,
    verified: true,
    verificationLevel: "COMPLETE",
    completedRequests: 12,
    responseTimeHrs: 3,
    lat: 12.1328,
    lng: -86.2504,
    trust: 86,
    image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
    medals: ["PERFIL_COMPLETO", "TELEFONO_VERIFICADO", "RESPONDE_RAPIDO"],
    catalog: [
      { id: "seed_item_tech_web", title: "Sitio web para emprendimiento", itemType: "SERVICIO_ESPECIALIZADO", subcategory: "Desarrollo web", priceMin: 5500, priceMax: 16000, priceUnit: "proyecto" },
      { id: "seed_item_tech_soporte", title: "Soporte técnico mensual", itemType: "MANTENIMIENTO", subcategory: "Soporte", priceMin: 1200, priceMax: 3500, priceUnit: "mes" },
    ],
  },
  {
    id: "seed_provider_cafe",
    userId: "seed_user_provider_cafe",
    displayName: "Finca Café Segovia",
    slug: "finca-cafe-segovia",
    city: LegacyCity.ESTELI,
    category: "Café y alimentos",
    mainCategory: "Café tostado local",
    shortDescription: "Café tostado, molido y paquetes para cafeterías pequeñas.",
    aboutDescription: "Finca familiar con café tostado de origen local, ideal para cafeterías, tiendas pequeñas y marcas que buscan producto nicaragüense constante.",
    priceRange: "MEDIUM",
    availability: Availability.DISPONIBLE,
    formalizationStatus: FormalizationStatus.INFORMAL,
    verified: false,
    verificationLevel: "PHONE",
    completedRequests: 7,
    responseTimeHrs: 6,
    lat: 13.0919,
    lng: -86.3538,
    trust: 74,
    image: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=80",
    medals: ["TELEFONO_VERIFICADO", "SOLICITUDES_COMPLETADAS"],
    catalog: [
      { id: "seed_item_cafe_molido", title: "Café molido para cafeterías", itemType: "PRODUCTO_FINAL", subcategory: "Café molido", priceMin: 180, priceMax: 320, priceUnit: "libra" },
      { id: "seed_item_cafe_degustacion", title: "Paquete de degustación local", itemType: "PRODUCTO_FINAL", subcategory: "Degustación", priceMin: 650, priceMax: 1200, priceUnit: "paquete" },
    ],
  },
  {
    id: "seed_provider_equipos",
    userId: "seed_user_provider_equipo",
    displayName: "Equipos Productivos León",
    slug: "equipos-productivos-leon",
    city: LegacyCity.LEON,
    category: "Insumos agrícolas",
    mainCategory: "Alquiler y reparación de equipos",
    shortDescription: "Alquiler, reparación y capacitación para equipos productivos.",
    aboutDescription: "Proveedor orientado a talleres y pequeños productores que necesitan alquilar, reparar o aprender a usar equipos productivos sin comprar maquinaria nueva.",
    priceRange: "LOW",
    availability: Availability.OCUPADO,
    formalizationStatus: FormalizationStatus.EN_PROCESO,
    verified: false,
    verificationLevel: "PHONE",
    completedRequests: 4,
    responseTimeHrs: 12,
    lat: 12.4346,
    lng: -86.8796,
    trust: 62,
    image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80",
    medals: ["TELEFONO_VERIFICADO", "EQUIPO_PRODUCTIVO_DISPONIBLE"],
    catalog: [
      { id: "seed_item_equipo_maquina_coser", title: "Máquina de coser industrial en alquiler", itemType: "ALQUILER_EQUIPO", subcategory: "Máquinas de coser", priceMin: 700, priceMax: 700, priceUnit: "día", equipment: true },
      { id: "seed_item_equipo_reparacion", title: "Reparación de hornos pequeños", itemType: "REPARACION_MANTENIMIENTO", subcategory: "Hornos", priceMin: 900, priceMax: 2800, priceUnit: "servicio" },
    ],
  },
  {
    id: "seed_provider_marketing",
    userId: "seed_user_provider_marketing",
    displayName: "Impulso Marketing Matagalpa",
    slug: "impulso-marketing-matagalpa",
    city: LegacyCity.MATAGALPA,
    category: "Marketing digital",
    mainCategory: "Contenido y campañas",
    shortDescription: "Campañas digitales, fotografía de producto y contenido local.",
    aboutDescription: "Estudio de marketing para emprendedores que necesitan mejorar contenido, lanzar campañas y presentar mejor sus productos en redes y marketplaces.",
    priceRange: "MEDIUM",
    availability: Availability.DISPONIBLE,
    formalizationStatus: FormalizationStatus.INFORMAL,
    verified: false,
    verificationLevel: "UNVERIFIED",
    completedRequests: 2,
    responseTimeHrs: 18,
    lat: 12.9256,
    lng: -85.9175,
    trust: 48,
    image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80",
    medals: ["PERFIL_COMPLETO"],
    catalog: [
      { id: "seed_item_marketing_campana", title: "Campaña para lanzamiento", itemType: "SERVICIO_ESPECIALIZADO", subcategory: "Campañas", priceMin: 2500, priceMax: 9000, priceUnit: "proyecto" },
      { id: "seed_item_marketing_fotos", title: "Fotografía de producto", itemType: "SERVICIO_ESPECIALIZADO", subcategory: "Fotografía", priceMin: 1200, priceMax: 3500, priceUnit: "sesión" },
    ],
  },
  {
    id: "seed_provider_draft",
    userId: "seed_user_provider_draft",
    displayName: "Sofía Bordados Draft",
    slug: "sofia-bordados-draft",
    city: LegacyCity.MASAYA,
    category: "Bordado y serigrafía",
    mainCategory: "Textil personalizado",
    shortDescription: "Bordados personalizados para negocios locales.",
    aboutDescription: "Pequeño taller de bordados con años de experiencia. Perfil en construcción para validar el flujo de publicación.",
    priceRange: "MEDIUM",
    availability: Availability.DISPONIBLE,
    formalizationStatus: FormalizationStatus.EN_PROCESO,
    verified: false,
    verificationLevel: "PHONE",
    completedRequests: 0,
    responseTimeHrs: 4,
    lat: 11.9900,
    lng: -86.0880,
    trust: 45,
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=80",
    medals: [],
    catalog: [],
  },
  {
    id: "seed_provider_inactive",
    userId: "seed_user_provider_inactive",
    displayName: "Cajas y Más Inactiva",
    slug: "cajas-y-mas-inactiva",
    city: LegacyCity.GRANADA,
    category: "Empaques ecológicos",
    mainCategory: "Empaques biodegradables",
    shortDescription: "Cajas, etiquetas y bolsas sostenibles para marcas.",
    aboutDescription: "Proveedor de empaques responsables para alimentos, café y cosmética artesanal. Cuenta actualmente inactiva.",
    priceRange: "HIGH",
    availability: Availability.DISPONIBLE,
    formalizationStatus: FormalizationStatus.MIPYME_FORMAL,
    verified: true,
    verificationLevel: "COMPLETE",
    completedRequests: 15,
    responseTimeHrs: 3,
    lat: 11.9280,
    lng: -85.9620,
    trust: 78,
    image: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=1200&q=80",
    medals: ["PERFIL_COMPLETO", "MIPYME_FORMAL"],
    catalog: [
      { id: "seed_item_inactive_kraft", title: "Empaque kraft para café", itemType: "INSUMO", subcategory: "Cajas kraft", priceMin: 6, priceMax: 14, priceUnit: "unidad" },
      { id: "seed_item_inactive_bolsas", title: "Bolsas de papel personalizadas", itemType: "INSUMO", subcategory: "Bolsas", priceMin: 3, priceMax: 10, priceUnit: "unidad" },
    ],
  },
  {
    id: "seed_provider_restricted",
    userId: "seed_user_provider_restricted",
    displayName: "Digital Express Restringido",
    slug: "digital-express-restringido",
    city: LegacyCity.MATAGALPA,
    category: "Marketing digital",
    mainCategory: "Contenido y campañas",
    shortDescription: "Gestión de redes sociales y campañas para PyMEs.",
    aboutDescription: "Agencia de contenido y campañas digitales para pequeños negocios. Restringido temporalmente por revisión pendiente.",
    priceRange: "MEDIUM",
    availability: Availability.DISPONIBLE,
    formalizationStatus: FormalizationStatus.INFORMAL,
    verified: false,
    verificationLevel: "PHONE",
    completedRequests: 3,
    responseTimeHrs: 8,
    lat: 12.9100,
    lng: -85.9300,
    trust: 55,
    image: "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?auto=format&fit=crop&w=1200&q=80",
    medals: ["TELEFONO_VERIFICADO"],
    catalog: [
      { id: "seed_item_restricted_redes", title: "Gestión mensual de redes", itemType: "SERVICIO_ESPECIALIZADO", subcategory: "Redes sociales", priceMin: 1800, priceMax: 5000, priceUnit: "mes" },
      { id: "seed_item_restricted_diseno", title: "Diseño de contenido mensual", itemType: "SERVICIO_ESPECIALIZADO", subcategory: "Diseño", priceMin: 1200, priceMax: 3500, priceUnit: "mes" },
    ],
  },
] as const;

const threadSeeds = [
  {
    id: "seed_thread_completed_textil",
    senderId: "seed_user_requester",
    providerId: "seed_provider_textil",
    catalogItemId: "seed_item_textil_camisetas",
    subject: "Camisetas bordadas para equipo",
    status: "COMPLETED",
    workflow_phase: "CLOSED",
    closure_outcome: "BILATERAL",
    moderation_state: "CLEAN",
    quotedPriceLabel: "C$3,200",
    quotedDeliveryTime: "5 días",
    completed: true,
  },
  {
    id: "seed_thread_open_empaques",
    senderId: "seed_user_requester",
    providerId: "seed_provider_empaques",
    catalogItemId: "seed_item_empaques_kraft",
    subject: "Empaque para café molido",
    status: "IN_CONVERSATION",
    workflow_phase: "OPEN",
    closure_outcome: null,
    moderation_state: "CLEAN",
    quotedPriceLabel: null,
    quotedDeliveryTime: null,
    completed: false,
  },
  {
    id: "seed_thread_quote_tech",
    senderId: "seed_user_provider_textil",
    providerId: "seed_provider_tech",
    catalogItemId: "seed_item_tech_web",
    subject: "Sitio web para catálogo textil",
    status: "QUOTE_SENT",
    workflow_phase: "OPEN",
    closure_outcome: null,
    moderation_state: "CLEAN",
    quotedPriceLabel: "C$9,500",
    quotedDeliveryTime: "10 días",
    completed: false,
  },
] as const;

async function main() {
  const password = await bcrypt.hash(PASSWORD, 12);

  await prisma.quoteOffer.deleteMany({ where: { OR: [{ requestId: { startsWith: "seed_" } }, { request: { providerId: { startsWith: "seed_" } } }] } });
  await prisma.quoteMessage.deleteMany({ where: { OR: [{ threadId: { startsWith: "seed_" } }, { thread: { providerId: { startsWith: "seed_" } } }] } });
  await prisma.reviewAnalysis.deleteMany({ where: { reviewId: { startsWith: "seed_" } } });
  await prisma.review.deleteMany({ where: { OR: [{ id: { startsWith: "seed_" } }, { providerId: { startsWith: "seed_" } }, { request: { providerId: { startsWith: "seed_" } } }] } });
  await prisma.quoteThread.deleteMany({ where: { OR: [{ id: { startsWith: "seed_" } }, { providerId: { startsWith: "seed_" } }] } });
  await prisma.catalogItemMetrics.deleteMany({ where: { catalogItemId: { startsWith: "seed_" } } });
  await prisma.catalogItemCategory.deleteMany({ where: { catalogItemId: { startsWith: "seed_" } } });
  await prisma.catalogItemPhoto.deleteMany({ where: { catalogItemId: { startsWith: "seed_" } } });
  await prisma.equipmentDetail.deleteMany({ where: { catalogItemId: { startsWith: "seed_" } } });
  await prisma.catalogItem.deleteMany({ where: { id: { startsWith: "seed_" } } });
  await prisma.providerCategory.deleteMany({ where: { providerId: { startsWith: "seed_" } } });
  await prisma.providerBusinessHour.deleteMany({ where: { providerId: { startsWith: "seed_" } } });
  await prisma.providerDeliveryOption.deleteMany({ where: { providerId: { startsWith: "seed_" } } });
  await prisma.providerMetrics.deleteMany({ where: { providerId: { startsWith: "seed_" } } });
  await prisma.trustScoreSnapshot.deleteMany({ where: { providerId: { startsWith: "seed_" } } });
  await prisma.riskReport.deleteMany({ where: { providerId: { startsWith: "seed_" } } });
  await prisma.formalizationStep.deleteMany({ where: { providerId: { startsWith: "seed_" } } });
  await prisma.providerPhoto.deleteMany({ where: { providerId: { startsWith: "seed_" } } });
  await prisma.providerMedal.deleteMany({ where: { providerId: { startsWith: "seed_" } } });
  await prisma.formalizationChecklist.deleteMany({ where: { providerId: { startsWith: "seed_" } } });
  await prisma.trustScore.deleteMany({ where: { providerId: { startsWith: "seed_" } } });
  await prisma.provider.deleteMany({ where: { id: { startsWith: "seed_" } } });
  await prisma.moderationAuditLog.deleteMany({ where: { targetId: { startsWith: "seed_" } } });
  await prisma.roleAssignment.deleteMany({ where: { userId: { startsWith: "seed_" } } });

  const cityIdByLegacy = new Map<LegacyCity, string>();
  const categoryIdBySlug = new Map<string, string>();

  for (const location of locationSeeds) {
    const department = await prisma.department.upsert({
      where: { slug: slugify(location.department) },
      update: { name: location.department },
      create: {
        id: `seed_department_${slugify(location.department)}`,
        name: location.department,
        slug: slugify(location.department),
      },
    });

    const city = await prisma.city.upsert({
      where: { slug: slugify(location.city) },
      update: {
        name: location.city,
        departmentId: department.id,
        legacyCode: location.legacyCode,
      },
      create: {
        id: `seed_city_${slugify(location.city)}`,
        name: location.city,
        slug: slugify(location.city),
        legacyCode: location.legacyCode,
        departmentId: department.id,
      },
    });

    cityIdByLegacy.set(location.legacyCode, city.id);
  }

  async function ensureCategory(name: string, parentCategoryId?: string | null) {
    const slug = slugify(name);
    const category = await prisma.category.upsert({
      where: { slug },
      update: { name, parentCategoryId: parentCategoryId ?? null },
      create: {
        id: `seed_category_${slug}`,
        name,
        slug,
        parentCategoryId: parentCategoryId ?? null,
      },
    });
    categoryIdBySlug.set(slug, category.id);
    return category;
  }

  for (const provider of providerSeeds) {
    const rootCategory = await ensureCategory(provider.category);
    await ensureCategory(provider.mainCategory, rootCategory.id);
    for (const item of provider.catalog) {
      await ensureCategory(item.subcategory, rootCategory.id);
    }
  }

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { id: user.id, name: user.name, role: user.role, password, emailVerified: now },
      create: { id: user.id, email: user.email, name: user.name, role: user.role, password, emailVerified: now },
    });
  }

  await prisma.moderationAuditLog.createMany({
    data: [
      {
        id: "seed_audit_suspend_cafe",
        actorUserId: "seed_user_superadmin",
        action: "PROVIDER_SUSPENDED",
        targetType: "PROVIDER",
        targetId: "seed_provider_cafe",
        reason: "Caso semilla para probar restricciones de proveedor suspendido.",
        metadata: { seeded: true, nextStatus: "SUSPENDED" },
        createdAt: now,
      },
      {
        id: "seed_audit_ban_equipo",
        actorUserId: "seed_user_superadmin",
        action: "PROVIDER_BANNED",
        targetType: "PROVIDER",
        targetId: "seed_provider_equipos",
        reason: "Caso semilla para probar restricciones de proveedor baneado.",
        metadata: { seeded: true, nextStatus: "BANNED" },
        createdAt: now,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.roleAssignment.createMany({
    data: [
      { id: "seed_role_requester", userId: "seed_user_requester", role: "REQUESTER", createdAt: now, updatedAt: now },
      { id: "seed_role_provider_textil", userId: "seed_user_provider_textil", role: "PROVIDER", createdAt: now, updatedAt: now },
      { id: "seed_role_provider_empaques", userId: "seed_user_provider_empaques", role: "PROVIDER", createdAt: now, updatedAt: now },
      { id: "seed_role_provider_cafe", userId: "seed_user_provider_cafe", role: "PROVIDER", createdAt: now, updatedAt: now },
      { id: "seed_role_provider_equipo", userId: "seed_user_provider_equipo", role: "PROVIDER", createdAt: now, updatedAt: now },
      { id: "seed_role_provider_draft", userId: "seed_user_provider_draft", role: "PROVIDER", createdAt: now, updatedAt: now },
      { id: "seed_role_provider_inactive", userId: "seed_user_provider_inactive", role: "PROVIDER", createdAt: now, updatedAt: now },
      { id: "seed_role_provider_restricted", userId: "seed_user_provider_restricted", role: "PROVIDER", createdAt: now, updatedAt: now },
      { id: "seed_role_admin_reviewer", userId: "seed_user_admin", role: "ADMIN_REVIEWER", createdAt: now, updatedAt: now },
      { id: "seed_role_super_admin", userId: "seed_user_superadmin", role: "SUPER_ADMIN", createdAt: now, updatedAt: now },
    ],
    skipDuplicates: true,
  });

  for (const provider of providerSeeds) {
    const cityId = cityIdByLegacy.get(provider.city);
    const rootCategoryId = categoryIdBySlug.get(slugify(provider.category));
    const mainCategoryId = categoryIdBySlug.get(slugify(provider.mainCategory));

    await prisma.provider.create({
      data: {
        id: provider.id,
        userId: provider.userId,
        displayName: provider.displayName,
        slug: provider.slug,
        city: provider.city,
        cityId,
        department: locationSeeds.find(location => location.legacyCode === provider.city)?.department,
        category: provider.category,
        mainCategory: provider.mainCategory,
        shortDescription: provider.shortDescription,
        aboutDescription: provider.aboutDescription,
        priceRange: provider.priceRange,
        availability: provider.availability,
        status: (provider.id === "seed_provider_cafe" ? "SUSPENDED"
          : provider.id === "seed_provider_equipos" ? "BANNED"
          : provider.id === "seed_provider_draft" ? "DRAFT"
          : provider.id === "seed_provider_inactive" ? "INACTIVE"
          : provider.id === "seed_provider_restricted" ? "TEMPORARILY_RESTRICTED"
          : "ACTIVE") as any,
        statusReason: (provider.id === "seed_provider_cafe"
          ? "Caso semilla: revisión temporal por señales agregadas de riesgo."
          : provider.id === "seed_provider_equipos"
            ? "Caso semilla: baneo para pruebas de restricción."
          : provider.id === "seed_provider_draft"
            ? "Caso semilla: proveedor en modo borrador — sin publicar."
          : provider.id === "seed_provider_inactive"
            ? "Caso semilla: proveedor inactivado manualmente por el equipo."
          : provider.id === "seed_provider_restricted"
            ? "Caso semilla: restringido temporalmente por revisión de contenido."
          : null) as string | null,
        suspendedUntil: (provider.id === "seed_provider_cafe"
          ? new Date("2026-08-07T12:00:00.000Z")
          : provider.id === "seed_provider_restricted"
            ? new Date("2026-07-19T12:00:00.000Z")
          : null) as Date | null,
        statusUpdatedAt: (provider.id === "seed_provider_cafe" || provider.id === "seed_provider_equipos" || provider.id === "seed_provider_draft" || provider.id === "seed_provider_inactive" || provider.id === "seed_provider_restricted"
          ? now
          : null) as Date | null,
        statusUpdatedById: (provider.id === "seed_provider_cafe" || provider.id === "seed_provider_equipos" || provider.id === "seed_provider_draft" || provider.id === "seed_provider_inactive" || provider.id === "seed_provider_restricted"
          ? "seed_user_superadmin"
          : null) as string | null,
        formalizationStatus: provider.formalizationStatus,
        verified: provider.verified,
        verificationLevel: provider.verificationLevel,
        profileCompleteness: provider.trust >= 80 ? 100 : 76,
        completedRequests: provider.completedRequests,
        responseTimeHrs: provider.responseTimeHrs,
        lat: provider.lat,
        lng: provider.lng,
        coverImageUrl: provider.image,
        categoryLinks: {
          create: [
            ...(rootCategoryId ? [{ categoryId: rootCategoryId, isPrimary: false }] : []),
            ...(mainCategoryId ? [{ categoryId: mainCategoryId, isPrimary: true }] : []),
          ],
        },
        businessHourRows: {
          create: [1, 2, 3, 4, 5].map(dayOfWeek => ({
            dayOfWeek,
            opensAt: "08:00",
            closesAt: "17:00",
            isClosed: false,
          })),
        },
        deliveryOptionRows: {
          create: [
            { label: "Retiro en local", details: "Disponible coordinando por chat de solicitud." },
            { label: "Entrega local", details: "Sujeta a ciudad, volumen y disponibilidad." },
          ],
        },
        metrics: {
          create: {
            avgRating: provider.trust >= 80 ? 4.8 : provider.trust >= 60 ? 4.2 : 3.6,
            totalVerifiedReviews: Math.max(1, Math.floor(provider.completedRequests / 2)),
            profileCompleteness: provider.trust >= 80 ? 100 : 76,
            responseTimeHrs: provider.responseTimeHrs,
            completedRequests: provider.completedRequests,
            requestsResponded: provider.completedRequests + 3,
            suspiciousActivityPenalty: provider.trust < 55 ? 25 : 0,
            calculatedAt: now,
          },
        },
        photos: {
          create: [
            { imageUrl: provider.image, photoType: "PORTAFOLIO", isFeatured: true },
          ],
        },
        medals: {
          create: provider.medals.map(medalType => ({
            medalType,
            sourceEvent: "seed-data",
          })),
        },
        riskReports: provider.trust < 55 ? {
          create: {
            riskScore: 58,
            suspiciousCyclesCount: 1,
            avgSearchTimeSeconds: 18,
            avgRequestToCompletionMinutes: 42,
            avgMessagesPerRequest: 2,
            newAccountsPercentage: 0.4,
            ratingConcentrationScore: 0.7,
            status: "OPEN",
            recommendedAction: "Revision manual de senales agregadas; no exponer datos privados.",
            generatedAt: now,
          },
        } : undefined,
        formalizationSteps: {
          create: [
            {
              code: "profile-basics",
              title: "Completar perfil publico",
              description: "Roadmap interno para mantener datos minimos del proveedor.",
              sortOrder: 1,
              isRequired: true,
              status: "ROADMAP",
            },
            {
              code: "business-records",
              title: "Ordenar informacion del negocio",
              description: "Soporte educativo; no valida documentos legales en este MVP.",
              sortOrder: 2,
              isRequired: false,
              status: "ROADMAP",
            },
          ],
        },
        checklistState: {
          create: {
            steps: [
              { id: "basic", title: "Información básica", status: "completed" },
              { id: "catalog", title: "Catálogo inicial", status: "completed" },
              { id: "docs", title: "Documentos de formalización", status: provider.formalizationStatus === FormalizationStatus.MIPYME_FORMAL ? "completed" : "pending" },
            ],
          },
        },
      },
    });

    for (const item of provider.catalog) {
      const itemCategoryId = categoryIdBySlug.get(slugify(item.subcategory)) ?? rootCategoryId;

      await prisma.catalogItem.create({
        data: {
          id: item.id,
          providerId: provider.id,
          title: item.title,
          itemType: item.itemType,
          category: provider.category,
          subcategory: item.subcategory,
          description: `${item.title} ofrecido por ${provider.displayName}. Seed data para validar búsqueda, perfil público, solicitudes y catálogo.`,
          priceMin: item.priceMin,
          priceMax: item.priceMax,
          priceUnit: item.priceUnit,
          city: provider.city,
          cityId,
          availabilityStatus: provider.availability,
          deliveryAvailable: true,
          pickupAvailable: true,
          mainImageUrl: provider.image,
          viewCount: 20 + provider.completedRequests,
          inquiryCount: Math.max(2, Math.floor(provider.completedRequests / 2)),
          categoryLinks: itemCategoryId ? {
            create: [{ categoryId: itemCategoryId, isPrimary: true }],
          } : undefined,
          metrics: {
            create: {
              viewCount: 20 + provider.completedRequests,
              inquiryCount: Math.max(2, Math.floor(provider.completedRequests / 2)),
              requestCount: Math.max(1, Math.floor(provider.completedRequests / 3)),
              calculatedAt: now,
            },
          },
          equipmentDetail: "equipment" in item && item.equipment ? {
            create: {
              modality: "ALQUILER",
              brand: "Industrial",
              model: "Seed demo",
              condition: "Buen estado",
              capacity: "Uso para talleres pequeños",
              requiresTraining: true,
              includesInstallation: false,
              maintenanceAvailable: true,
            },
          } : undefined,
          photos: {
            create: [{ imageUrl: provider.image, caption: item.title, isFeatured: true }],
          },
        },
      });
    }
  }

  for (const thread of threadSeeds) {
    const completedAt = thread.completed ? new Date("2026-07-02T16:00:00.000Z") : null;
    await prisma.quoteThread.create({
      data: {
        id: thread.id,
        senderId: thread.senderId,
        providerId: thread.providerId,
        catalogItemId: thread.catalogItemId,
        subject: thread.subject,
        clientName: users.find(user => user.id === thread.senderId)?.name ?? "Cliente seed",
        clientAvatar: "SE",
        dateLabel: thread.completed ? "Completada" : "Reciente",
        status: thread.status,
        workflow_phase: thread.workflow_phase,
        closure_outcome: thread.closure_outcome,
        moderation_state: thread.moderation_state,
        quotedPriceLabel: thread.quotedPriceLabel,
        quotedDeliveryTime: thread.quotedDeliveryTime,
        confirmedByRequesterAt: completedAt,
        confirmedByProviderAt: completedAt,
        completedAt,
        quoteOffers: thread.quotedPriceLabel ? {
          create: {
            providerId: thread.providerId,
            priceLabel: thread.quotedPriceLabel,
            deliveryTimeLabel: thread.quotedDeliveryTime,
            notes: "Oferta seed vinculada a una solicitud/conversacion.",
            status: thread.completed ? "ACCEPTED" : "SENT",
          },
        } : undefined,
        messages: {
          create: [
            {
              id: `${thread.id}_msg_1`,
              authorId: thread.senderId,
              authorRole: "client",
              body: `Hola, necesito una propuesta para: ${thread.subject}.`,
              createdAt: new Date("2026-07-01T10:00:00.000Z"),
            },
            {
              id: `${thread.id}_msg_2`,
              authorId: providerSeeds.find(provider => provider.id === thread.providerId)?.userId ?? thread.providerId,
              authorRole: "provider",
              body: thread.quotedPriceLabel ? `Gracias. Puedo cotizarlo en ${thread.quotedPriceLabel} con entrega de ${thread.quotedDeliveryTime}.` : "Gracias por escribir. Revisemos cantidades, fecha y alcance para darte una propuesta clara.",
              createdAt: new Date("2026-07-01T12:00:00.000Z"),
            },
          ],
        },
      },
    });
  }

  const completedReview = await prisma.review.create({
    data: {
      id: "seed_review_textil_completed",
      providerId: "seed_provider_textil",
      reviewerId: "seed_user_requester",
      requestId: "seed_thread_completed_textil",
      qualityScore: 5,
      responseTimeScore: 5,
      fulfillmentScore: 5,
      communicationScore: 4,
      valueScore: 5,
      generalScore: 4.8,
      comment: "Trabajo confirmado dentro de la plataforma. Buena comunicación y entrega según lo acordado.",
      sentiment: 0.9,
      createdAt: new Date("2026-07-03T10:00:00.000Z"),
    },
  });

  await prisma.reviewAnalysis.create({
    data: {
      reviewId: completedReview.id,
      sentimentScore: 0.9,
      qualitySignals: { verifiedRequest: true, bilateralCompletion: true },
      moderationFlags: { suspicious: false },
      generalScore: 4.8,
      algorithmVersion: "v1-seeded-normalized",
      calculatedAt: new Date("2026-07-03T10:05:00.000Z"),
    },
  });

  console.log("🔄 Generando trabajos bilaterales y reseñas realistas...");
  const requesterPool = users.filter(u => u.id !== "seed_user_superadmin").map(u => u.id);

  for (const provider of providerSeeds) {
    const threadsToCreate = Math.min(provider.completedRequests, 10);
    for (let i = 0; i < threadsToCreate; i++) {
      const requesterId = requesterPool[i % requesterPool.length];
      if (requesterId === provider.userId) continue;

      const threadId = `seed_trust_thread_${provider.id}_${i}`;
      const createdAt = new Date(now.getTime() - (40 - i) * 24 * 60 * 60 * 1000);
      const completedAt = new Date(createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);

      await prisma.quoteThread.create({
        data: {
          id: threadId,
          senderId: requesterId,
          providerId: provider.id,
          subject: `Solicitud de ${provider.category} #${i + 1}`,
          clientName: users.find(u => u.id === requesterId)?.name ?? "Cliente seed",
          clientAvatar: "SE",
          dateLabel: "Completada",
          status: "COMPLETED",
          workflow_phase: "CLOSED",
          closure_outcome: "BILATERAL",
          moderation_state: "CLEAN",
          confirmedByRequesterAt: completedAt,
          confirmedByProviderAt: completedAt,
          completedAt,
          createdAt,
          messages: {
            create: [
              { authorId: requesterId, authorRole: "client", body: `Hola, necesito una propuesta para: ${provider.category} #${i + 1}.`, createdAt },
              { authorId: provider.userId, authorRole: "provider", body: "Gracias, puedo ayudarte. Confirmemos alcance y fechas.", createdAt: new Date(createdAt.getTime() + 60 * 60 * 1000) },
            ],
          },
        },
      });

      if (Math.random() < 0.8) {
        const base = provider.trust >= 80 ? 4 : provider.trust >= 60 ? 4 : 3;
        const score = Math.min(5, Math.max(1, Math.round(base + Math.random())));
        await prisma.review.create({
          data: {
            providerId: provider.id,
            reviewerId: requesterId,
            requestId: threadId,
            qualityScore: score,
            responseTimeScore: score,
            fulfillmentScore: score,
            communicationScore: score,
            valueScore: score,
            generalScore: score,
            comment: "Review generada automáticamente a partir de trabajo bilateral seed.",
            weight: 1.0,
            createdAt: new Date(completedAt.getTime() + 60 * 60 * 1000),
          },
        });
      }
    }
  }

  console.log("🔄 Recalculando Trust Scores desde eventos reales...");
  for (const provider of providerSeeds) {
    try {
      const result = await recalculateProviderTrustScore(provider.id);
      console.log(`   ${provider.displayName}: public=${result.public_score ?? "INSUFICIENTE"} internal=${result.internal_score}`);
    } catch (error) {
      console.warn(`   ${provider.displayName}: error al recalcular:`, error);
    }
  }
  console.log("✅ Trust Scores derivados de eventos reales");

  console.log("Seed data ready.");
  console.log("Try: requester@conecta.test, textil@conecta.test, cafe@conecta.test, equipos@conecta.test, admin@conecta.test, superadmin@conecta.test");
}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
