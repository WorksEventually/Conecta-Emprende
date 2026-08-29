import type { ClientProfile, RoleAssignment, UserAccount } from "./identity";
import { demoAccounts, demoClientProfiles, demoOffers, demoProviders, demoRoleAssignments } from "../auth/demoProfiles";

export const CREATIVE_CITIES = ["Estelí", "León", "Nagarote", "Managua", "Masaya", "Granada", "San Juan de Oriente", "Juigalpa", "Matagalpa", "Bluefields"] as const;
export type CreativeCity = typeof CREATIVE_CITIES[number];
export type PriceRange = "LOW" | "MEDIUM" | "HIGH" | "NEGOTIABLE";
export type Availability = "AVAILABLE" | "BUSY" | "UNAVAILABLE";
export type FormalizationStatus = "INFORMAL" | "IN_PROGRESS" | "MIPYME";
export type VerificationLevel = "UNVERIFIED" | "PHONE" | "COMPLETE";
export type RequestStatus = "DRAFT" | "OPEN" | "IN_CONVERSATION" | "CLOSED_BY_REQUESTER" | "CLOSED_BY_PROVIDER" | "COMPLETED" | "CANCELLED" | "DISPUTED";
export type OfferType = "PRODUCT" | "SERVICE" | "PACKAGE" | "PORTFOLIO_ITEM";
export type OfferStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type PriceType = "FIXED" | "FROM" | "NEGOTIABLE" | "PER_UNIT" | "PER_PROJECT";
export type MessageType = "TEXT" | "SYSTEM" | "QUOTE_SUMMARY" | "STATUS_UPDATE" | "QUICK_REPLY" | "COMPLETION_REQUEST" | "REVIEW_UNLOCKED";

export interface ProviderProfile {
  id: string; ownerUserId: string; publicName: string; tagline?:string; avatarUrl?:string; coverImageUrl?:string; city: CreativeCity; category: string;
  description: string; serviceArea:CreativeCity[]; services: string[]; priceRange: PriceRange; availability: Availability;
  portfolioImages: string[]; formalizationStatus: FormalizationStatus; verificationLevel: VerificationLevel;
  trustScore: number; medals: string[]; responseTimeHrs: number; completedRequests: number; profileCompleteness:number;
  lat: number; lng: number; contactPreference: string; createdAt: string; updatedAt: string;
  profileStatus?: "DRAFT" | "ACTIVE" | "SUSPENDED"; avgRating?: number | null; totalVerifiedReviews?: number; suspiciousActivityPenalty?: number;
}
export interface QuoteRequest {
  id: string; requesterId: string; requesterName: string; providerId: string; title: string;
  productId?: string | null; description: string; desiredDate?: string; budgetRange?: PriceRange; location?: CreativeCity; contactPreference: string;
  status: RequestStatus; confirmedByRequesterAt?: string | null; confirmedByProviderAt?: string | null;
  quotedPriceLabel?: string; quotedDeliveryTime?: string; completedAt?: string | null; createdAt: string; updatedAt: string;
  unreadByProvider: number; unreadByRequester: number; messages: ChatMessage[];
}
export interface ChatMessage { id:string; author:"requester"|"provider"|"system"; senderId:string|"SYSTEM"; type:MessageType; text:string; metadata?:Record<string,unknown>; createdAt:string; }
export interface ProviderOffer { id:string; providerId:string; type:OfferType; status:OfferStatus; name:string; category:string; shortDescription:string; fullDescription:string; priceType:PriceType; priceLabel:string; minimumOrder?:string; estimatedDelivery?:string; availability:Availability; cityCoverage:CreativeCity[]; tags:string[]; imageUrls:string[]; viewCount:number; inquiryCount:number; createdAt:string; updatedAt:string; }
export interface Review { id: string; requestId: string; reviewerId: string; providerId: string; score: number; text: string; createdAt: string; }
export interface Report { id: string; reporterId: string; targetType: "PROVIDER" | "REQUEST" | "REVIEW"; targetId: string; reason: string; description: string; status: "PENDING" | "REVIEWED" | "DISMISSED" | "ESCALATED"; createdAt: string; }

const cityGeo: Record<CreativeCity, [number, number]> = {
  "Estelí": [13.0919,-86.3538], "León": [12.4346,-86.8796], "Nagarote": [12.2659,-86.5647],
  "Managua": [12.1328,-86.2504], "Masaya": [11.9744,-86.0944], "Granada": [11.9344,-85.956],
  "San Juan de Oriente": [11.9065,-86.0741], "Juigalpa": [12.1063,-85.3645],
  "Matagalpa": [12.9256,-85.9175], "Bluefields": [12.0137,-83.7635],
};
const categories = ["Diseño gráfico", "Bordado y serigrafía", "Empaques ecológicos", "Café y alimentos", "Artesanía", "Fotografía", "Marketing digital", "Insumos agrícolas", "Muebles y carpintería", "Servicios tecnológicos"];
const nameByCategory:Record<string,string>={"Diseño gráfico":"Estudio","Bordado y serigrafía":"Taller Textil","Empaques ecológicos":"Empaques","Café y alimentos":"Finca","Artesanía":"Taller Artesano","Fotografía":"Luz","Marketing digital":"Impulso","Insumos agrícolas":"Agroservicio","Muebles y carpintería":"Madera","Servicios tecnológicos":"Nexo Digital"};
const nameSuffixes=["Ceibo","Mombacho","Guardabarranco","Segovia","Cocibolca"];
const serviceByCategory: Record<string, string[]> = {
  "Diseño gráfico": ["Logotipos", "Identidad visual", "Piezas para redes"],
  "Bordado y serigrafía": ["Camisetas bordadas", "Uniformes", "Serigrafía por volumen"],
  "Empaques ecológicos": ["Bolsas kraft", "Cajas reciclables", "Etiquetas biodegradables"],
  "Café y alimentos": ["Café tostado", "Alimentos por encargo", "Entrega local"],
  "Artesanía": ["Cerámica", "Piezas personalizadas", "Pedidos al por mayor"],
  "Fotografía": ["Fotografía de producto", "Eventos", "Retrato comercial"],
  "Marketing digital": ["Redes sociales", "Campañas", "Contenido"],
  "Insumos agrícolas": ["Semillas", "Herramientas", "Asesoría de cultivo"],
  "Muebles y carpintería": ["Muebles a medida", "Restauración", "Entrega local"],
  "Servicios tecnológicos": ["Sitios web", "Soporte técnico", "Automatización"],
};
const imageByCategory: Record<string, string> = {
  "Diseño gráfico":"https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=1000&q=80",
  "Bordado y serigrafía":"https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=1000&q=80",
  "Empaques ecológicos":"https://images.unsplash.com/photo-1605600659908-0ef719419d41?auto=format&fit=crop&w=1000&q=80",
  "Café y alimentos":"https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1000&q=80",
  "Artesanía":"https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=1000&q=80",
  "Fotografía":"https://images.unsplash.com/photo-1452780212940-6f5c0d14d848?auto=format&fit=crop&w=1000&q=80",
  "Marketing digital":"https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1000&q=80",
  "Insumos agrícolas":"https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1000&q=80",
  "Muebles y carpintería":"https://images.unsplash.com/photo-1531835551805-16d864c8d311?auto=format&fit=crop&w=1000&q=80",
  "Servicios tecnológicos":"https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1000&q=80",
};

export function calculateTrustScore(input:{phoneVerified:boolean;profileComplete:boolean;requestsResponded:number;requestsCompleted:number;averageReview:number;accountAgeDays:number}){
  const ageFactor=input.accountAgeDays<7?.2:input.accountAgeDays<30?.5:input.accountAgeDays<90?.8:1;
  return Math.round((Number(input.phoneVerified)*15+Number(input.profileComplete)*15+Math.min(input.requestsResponded/5,1)*20+Math.min(input.requestsCompleted/10,1)*30+(input.averageReview/5)*20)*ageFactor);
}

export const seedProviders: ProviderProfile[] = Array.from({ length: 50 }, (_, index) => {
  const city = index === 0 ? "Managua" : CREATIVE_CITIES[index % CREATIVE_CITIES.length];
  const category = index === 1 ? "Empaques ecológicos" : index === 4 ? "Bordado y serigrafía" : index === 8 ? "Café y alimentos" : categories[index % categories.length];
  const [lat,lng] = cityGeo[city];
  const formalizationStatus: FormalizationStatus = index % 5 === 0 ? "MIPYME" : index % 3 === 0 ? "IN_PROGRESS" : "INFORMAL";
  const verificationLevel: VerificationLevel = index % 4 === 0 ? "COMPLETE" : index % 3 === 0 ? "PHONE" : "UNVERIFIED";
  const accountAgeDays=index%9===0?5:index%7===0?20:index%4===0?65:180;
  const completedRequests=index%17;
  const trustScore=calculateTrustScore({phoneVerified:verificationLevel!=="UNVERIFIED",profileComplete:true,requestsResponded:2+(index%8),requestsCompleted:completedRequests,averageReview:4+(index%2)*.5,accountAgeDays});
  return {
    id: `provider-${index + 1}`, ownerUserId: index === 0 ? "user-provider" : `user-${index + 1}`,
    publicName: index === 0 ? "Estudio Creativo Managua" : `${nameByCategory[category]} ${nameSuffixes[Math.floor(index/10)]} ${city}`,
    city, category, tagline:`${serviceByCategory[category][0]} con atención clara y local.`,description: `${serviceByCategory[category][0]} y soluciones hechas en ${city} para emprendimientos que buscan calidad, comunicación clara y entregas responsables.`,serviceArea:[city],
    services: serviceByCategory[category], priceRange: (["LOW","MEDIUM","HIGH"] as PriceRange[])[index % 3],
    availability: index % 7 === 0 ? "BUSY" : "AVAILABLE", portfolioImages: [imageByCategory[category]],
    formalizationStatus, verificationLevel, trustScore, responseTimeHrs: 1 + (index % 12), completedRequests,profileCompleteness:100,
    medals: ["Perfil completo", ...(verificationLevel !== "UNVERIFIED" ? ["Teléfono verificado"] : []), ...(completedRequests > 0 ? ["Actividad verificada"] : []), ...(trustScore >= 80 ? ["Confianza alta"] : [])],
    lat: lat + (index % 5) * .004, lng: lng + (index % 4) * .004, contactPreference: "WhatsApp", createdAt:new Date(Date.now()-accountAgeDays*86400000).toISOString(), updatedAt: new Date().toISOString(),
  };
});

const offerNames:Record<string,[string,string]>={
  "Diseño gráfico":["Diseño de logo para emprendimiento","Kit de identidad para redes"],
  "Bordado y serigrafía":["Camisetas bordadas para equipos","Paquete de uniformes personalizados"],
  "Empaques ecológicos":["Empaque kraft personalizado","Etiquetas biodegradables para productos"],
  "Café y alimentos":["Café molido para cafeterías","Paquete de degustación local"],
  "Artesanía":["Pieza artesanal personalizada","Colección de cerámica para negocios"],
  "Fotografía":["Sesión de fotos para catálogo","Paquete visual para lanzamiento"],
  "Marketing digital":["Gestión mensual de redes","Campaña de lanzamiento digital"],
  "Insumos agrícolas":["Kit inicial de cultivo","Asesoría para producción agrícola"],
  "Muebles y carpintería":["Muebles rústicos para restaurantes","Diseño y fabricación a medida"],
  "Servicios tecnológicos":["Sitio web para emprendimiento","Soporte y automatización básica"],
};
export const seedOffers:ProviderOffer[]=seedProviders.flatMap((provider,providerIndex)=>[0,1].map(offerIndex=>{
  const type:OfferType=offerIndex===0?(provider.category.includes("Café")||provider.category.includes("Empaques")||provider.category.includes("Bordado")||provider.category.includes("Muebles")||provider.category.includes("Artesanía")||provider.category.includes("Insumos")?"PRODUCT":"SERVICE"):"PACKAGE";
  const createdAt=new Date(Date.now()-(providerIndex+offerIndex+10)*86400000).toISOString();
  return {id:`offer-${providerIndex+1}-${offerIndex+1}`,providerId:provider.id,type,status:"ACTIVE",name:offerNames[provider.category][offerIndex],category:provider.category,shortDescription:`${provider.services[offerIndex]} para emprendimientos con alcance claro y acompañamiento local.`,fullDescription:`Oferta de ${provider.publicName} diseñada para pequeños negocios. Incluye coordinación dentro de la plataforma, alcance definido y seguimiento hasta la entrega.`,priceType:offerIndex===0?"FROM":"PER_PROJECT",priceLabel:provider.priceRange==="LOW"?(offerIndex===0?"Desde C$250":"Desde C$900"):provider.priceRange==="MEDIUM"?(offerIndex===0?"Desde C$1,200":"Desde C$2,500"):(offerIndex===0?"Desde C$3,500":"Desde C$7,500"),minimumOrder:type==="PRODUCT"?(provider.category.includes("Empaques")?"100 unidades":"10 unidades"):undefined,estimatedDelivery:type==="SERVICE"?"5 a 7 días":"7 a 12 días",availability:provider.availability,cityCoverage:[provider.city],tags:[...provider.services.slice(0,2),provider.city],imageUrls:provider.portfolioImages,viewCount:28+providerIndex*3+offerIndex,inquiryCount:3+(providerIndex%8)+offerIndex,createdAt,updatedAt:new Date().toISOString()};
}));

export const seedRequests: QuoteRequest[] = Array.from({ length: 10 }, (_, index) => {
  const createdAt=`2026-06-${String(10+index).padStart(2,"0")}T10:00:00.000Z`;
  const completed=index<5;
  return {
    id:`request-${index+1}`,requesterId:"user-client",requesterName:"Andrea López",providerId:`provider-${(index%8)+1}`,productId:index<5?`offer-${(index%8)+1}-1`:null,
    title:["Identidad para nuevo negocio","Empaque para café","Pedido de uniformes","Catálogo de productos"][index%4],description:"Necesito una propuesta clara con alcance, tiempo estimado y condiciones de entrega para mi emprendimiento.",budgetRange:(["LOW","MEDIUM","HIGH"] as PriceRange[])[index%3],location:CREATIVE_CITIES[index%10],contactPreference:"Mensajes de la plataforma",
    status:completed?"COMPLETED":index<7?"IN_CONVERSATION":index<9?"IN_CONVERSATION":"OPEN",quotedPriceLabel:index<7?`C$${1200+index*350}`:undefined,quotedDeliveryTime:index<7?"5 días":undefined,
    confirmedByRequesterAt:completed?"2026-06-20T14:00:00.000Z":null,confirmedByProviderAt:completed?"2026-06-20T16:00:00.000Z":null,completedAt:completed?"2026-06-20T16:00:00.000Z":null,createdAt,updatedAt:createdAt,unreadByProvider:index%3,unreadByRequester:index%2,
    messages:[
      {id:`system-${index}`,author:"system",senderId:"SYSTEM",type:"SYSTEM",text:"Esta conversación queda vinculada a tu solicitud para dar seguimiento y desbloquear una reseña verificada al finalizar.",createdAt},
      {id:`message-${index}`,author:"requester",senderId:"user-client",type:"TEXT",text:"Hola, me gustaría conocer su disponibilidad y recibir una cotización.",createdAt},
      ...(index<9?[{id:`reply-${index}`,author:"provider" as const,senderId:`user-${(index%8)+1}`,type:(index<7?"QUOTE_SUMMARY":"TEXT") as MessageType,text:index<7?`Cotización estimada: C$${1200+index*350} · Entrega: 5 días · Pendiente de aceptación.`:"Gracias por escribir. Tengo disponibilidad para revisar los detalles.",createdAt:`2026-06-${String(11+index).padStart(2,"0")}T11:30:00.000Z`}]:[]),
      ...(completed?[{id:`unlock-${index}`,author:"system" as const,senderId:"SYSTEM" as const,type:"REVIEW_UNLOCKED" as const,text:"Solicitud completada. Ya podés dejar una reseña verificada.",createdAt:"2026-06-20T16:00:00.000Z"}]:[]),
    ],
  };
});
export const seedReviews: Review[] = seedRequests.slice(0,5).map((request,index) => ({ id:`review-${index+1}`, requestId:request.id, reviewerId:"user-client", providerId:request.providerId, score: 4 + (index % 2), text:"Trabajo confirmado, buena comunicación y entrega según lo acordado.", createdAt:"2026-06-21T10:00:00.000Z" }));
export const seedReports: Report[] = [
  ["Información engañosa", "El proveedor no coincide con la descripción del perfil."],
  ["Posible spam", "La conversación parece spam y repite el mismo mensaje."],
  ["Imágenes dudosas", "El perfil usa fotos que no parecen propias."],
].map(([reason,description],index) => ({ id:`report-${index+1}`, reporterId:"user-client", targetType:"PROVIDER", targetId:`provider-${index+6}`, reason, description, status:"PENDING", createdAt:`2026-06-${22+index}T10:00:00.000Z` }));

const identityTimestamp="2026-01-15T12:00:00.000Z";
export const seedAccounts:UserAccount[]=[
  {id:"user-provider",email:"maria@conecta.ni",displayName:"María Fernanda Ruiz",status:"ACTIVE",emailVerifiedAt:identityTimestamp,phoneVerifiedAt:identityTimestamp,createdAt:identityTimestamp,updatedAt:identityTimestamp},
  {id:"user-client",email:"andrea@conecta.ni",displayName:"Andrea López",status:"ACTIVE",emailVerifiedAt:identityTimestamp,phoneVerifiedAt:null,createdAt:identityTimestamp,updatedAt:identityTimestamp},
  ...seedProviders.filter(provider=>provider.ownerUserId!=="user-provider").map(provider=>({id:provider.ownerUserId,email:`${provider.ownerUserId}@example.invalid`,displayName:provider.publicName,status:"ACTIVE" as const,emailVerifiedAt:identityTimestamp,phoneVerifiedAt:provider.verificationLevel==="UNVERIFIED"?null:identityTimestamp,createdAt:provider.createdAt,updatedAt:provider.updatedAt})),
  ...demoAccounts,
];
export const seedClientProfiles:ClientProfile[]=[{id:"client-profile-1",userId:"user-client",publicName:"Andrea López",city:"Managua",avatarUrl:null,createdAt:identityTimestamp,updatedAt:identityTimestamp},...demoClientProfiles];
export const seedRoleAssignments:RoleAssignment[]=[
  ...seedAccounts.filter(account=>!account.id.includes("_demo")).map((account,index)=>({id:`role-requester-${index+1}`,userId:account.id,role:"REQUESTER" as const,grantedAt:identityTimestamp,grantedByUserId:null})),
  ...seedProviders.map((provider,index)=>({id:`role-provider-${index+1}`,userId:provider.ownerUserId,role:"PROVIDER" as const,grantedAt:identityTimestamp,grantedByUserId:null})),
  {id:"role-admin-reviewer-1",userId:"user-provider",role:"ADMIN_REVIEWER",grantedAt:identityTimestamp,grantedByUserId:null},
  {id:"role-super-admin-1",userId:"user-provider",role:"SUPER_ADMIN",grantedAt:identityTimestamp,grantedByUserId:null},
  ...demoRoleAssignments,
];

seedProviders.push(...demoProviders);
seedOffers.push(...demoOffers);

export const CATEGORY_OPTIONS = categories;
export const priceLabel: Record<PriceRange,string> = { LOW:"Económico", MEDIUM:"Intermedio", HIGH:"Premium", NEGOTIABLE:"Negociable" };
export const availabilityLabel: Record<Availability,string> = { AVAILABLE:"Disponible", BUSY:"Agenda limitada", UNAVAILABLE:"No disponible" };
export const formalizationLabel: Record<FormalizationStatus,string> = { INFORMAL:"Legacy informal", IN_PROGRESS:"Legacy en progreso", MIPYME:"Legacy completo" };
