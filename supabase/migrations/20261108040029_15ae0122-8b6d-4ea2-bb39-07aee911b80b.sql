-- Synthetic records copied from the Doorstep demo; preserve existing records.
INSERT INTO public.incidents (id, disaster_type, area, started_at, status)
VALUES ('INC-RICH-1107', 'Severe thunderstorm', 'Richardson, TX', '2026-11-07 00:00:00-06', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.residents (id,name,lat,lng,preferred_language,contact_channels,phone,household_size,lives_alone,emergency_contacts,preparedness_plan,plan_detail,needs,insurance,consent)
SELECT id,name,lat,lng,language,ARRAY['sms','voice'],phone,household_size,lives_alone,
jsonb_build_array(jsonb_build_object('name',contact_name,'relation',contact_relation)),plan,plan_detail,
jsonb_build_object('powerDependentEquipment',power_equipment,'criticalMedical',critical,'mobility',mobility,'transportation',transportation,'accessibleShelter',accessible,'pets',pets),
CASE WHEN carrier IS NULL THEN NULL ELSE jsonb_build_object('carrier',carrier,'documentsReady',documents_ready) END,
jsonb_build_object('automatedMessages',true,'voiceCalls',voice_calls,'contactEmergencyContact',contact_consent,'neighborCheck',true,'shareWithResponders',true)
FROM (VALUES
('400','Grace Whitfield',32.95455,-96.739,'English','555-0100',3,false,'Tom','husband','home',NULL,NULL,false,false,false,false,true,NULL,NULL,true,true),
('402','Ken Park',32.95455,-96.73874,'English','555-0102',2,false,'Jin','wife','home',NULL,NULL,false,false,false,false,false,NULL,NULL,true,true),
('404','Rosa Delgado',32.95455,-96.73848000000001,'Spanish','555-0104',4,false,'Luis','brother','shelter','At Richardson shelter',NULL,false,false,false,false,false,NULL,NULL,true,true),
('406','Omar Haddad',32.95455,-96.73822,'Arabic','555-0106',3,false,'Layla','daughter','home',NULL,'Home oxygen concentrator',true,false,false,false,false,NULL,NULL,true,true),
('408','Linh Nguyen',32.95455,-96.73796,'Vietnamese','555-0108',2,false,'Bao','husband','home',NULL,NULL,false,false,false,false,false,NULL,NULL,true,true),
('410','Harold Brooks',32.95455,-96.7377,'English','555-0110',1,true,'Anne','daughter','family','At daughter''s in Allen',NULL,false,false,false,false,true,NULL,NULL,true,true),
('412','Elena Lopez',32.95455,-96.73744,'Spanish','555-0112',1,true,'Carmen','niece','home',NULL,NULL,false,true,false,true,false,NULL,NULL,true,true),
('414','Maria Gonzalez',32.95455,-96.73718000000001,'Spanish','555-0114',2,false,'Jorge','husband','home',NULL,NULL,false,false,false,false,false,NULL,NULL,true,true),
('416','Samir Aziz',32.95455,-96.73692,'Arabic','555-0116',1,true,'Nadia','sister','home',NULL,NULL,false,false,false,false,false,NULL,NULL,true,true),
('418','Betty Olsen',32.95455,-96.73666,'English','555-0118',1,true,'Eric','grandson','home',NULL,'Insulin refrigeration',true,false,false,false,false,NULL,NULL,true,true),
('419','James Carter',32.95325,-96.73653,'English','555-0119',4,false,'Dana','wife','home',NULL,NULL,false,false,false,false,false,NULL,NULL,true,true),
('421','Ana Ruiz',32.95325,-96.73627,'Spanish','555-0121',3,false,'Pablo','partner','home',NULL,NULL,false,false,false,false,false,'Self-reported homeowner policy',false,true,true),
('423','Thu Pham',32.95325,-96.73601000000001,'Vietnamese','555-0123',2,false,'Minh','son','shelter','At Richardson shelter',NULL,false,false,false,false,false,NULL,NULL,true,true),
('425','Fatima Saleh',32.95325,-96.73575000000001,'Arabic','555-0125',4,false,'Karim','husband','home',NULL,NULL,false,false,false,false,true,'Self-reported homeowner policy',false,true,true),
('427','Hung Tran',32.95325,-96.73549,'Vietnamese','555-0127',1,true,'Daniel','son','family','At son''s in Plano',NULL,true,false,false,false,false,NULL,NULL,true,true),
('429','Mike Russo',32.95325,-96.73523,'English','555-0129',2,false,'Gina','wife','home',NULL,NULL,false,false,false,false,false,'Self-reported homeowner policy',false,true,true),
('431','Carlos Mendez',32.95325,-96.73497,'Spanish','555-0131',4,false,'Sofia','wife','home',NULL,NULL,false,false,false,false,false,NULL,NULL,true,true),
('433','Frank Walsh',32.95325,-96.73471,'English','555-0133',1,true,'Unknown','none on file',NULL,NULL,NULL,false,true,false,false,false,'Self-reported homeowner policy',false,true,false),
('435','Priya Shah',32.95325,-96.73445000000001,'English','555-0135',1,true,'Raj','brother',NULL,NULL,NULL,false,false,false,false,true,NULL,NULL,true,true),
('437','Duc Le',32.95325,-96.73419,'Vietnamese','555-0137',4,false,'Mai','wife','home',NULL,NULL,false,false,false,false,false,'Self-reported homeowner policy',false,true,true),
('438','Alice Bennett',32.95455,-96.73406,'English','555-0138',1,true,'Alex','child','home',NULL,NULL,false,true,false,false,false,NULL,NULL,true,true),
('440','George Wilson',32.95455,-96.7338,'Spanish','555-0140',1,true,'Alex','child','home',NULL,NULL,false,false,false,false,true,NULL,NULL,true,true),
('442','Nadia Hassan',32.95455,-96.73354,'Vietnamese','555-0142',1,true,'Alex','child','home',NULL,NULL,false,false,false,false,false,NULL,NULL,true,true),
('444','Minh Vu',32.95455,-96.73328000000001,'Arabic','555-0144',1,true,'Alex','child','home',NULL,NULL,false,true,false,false,false,NULL,NULL,true,true),
('446','Lucia Torres',32.95455,-96.73302000000001,'English','555-0146',1,true,'Alex','child','home',NULL,NULL,false,false,false,false,false,NULL,NULL,true,true),
('448','Robert Ellis',32.95455,-96.73276,'Spanish','555-0148',1,true,'Alex','child','home',NULL,NULL,false,false,false,false,false,NULL,NULL,true,true),
('450','Evelyn Reed',32.95455,-96.7325,'Vietnamese','555-0150',1,true,'Alex','child','home',NULL,NULL,false,true,false,false,true,NULL,NULL,true,true),
('452','Hassan Ali',32.95455,-96.73224,'Arabic','555-0152',1,true,'Alex','child','home',NULL,NULL,false,false,false,false,false,NULL,NULL,true,true),
('454','David Kim',32.95455,-96.73198000000001,'English','555-0154',3,false,'Alex','child','home',NULL,NULL,false,false,false,false,false,NULL,NULL,true,true),
('456','Sofia Reyes',32.95455,-96.73172000000001,'Spanish','555-0156',2,false,'Alex','child','home',NULL,NULL,false,true,false,false,false,NULL,NULL,true,true),
('439','Wei Zhang',32.95325,-96.73393,'Mandarin','555-0139',1,true,'Li','mother (overseas)','home',NULL,NULL,false,false,false,false,false,NULL,NULL,false,true),
('441','Dolores Medina',32.95325,-96.73367,'Spanish','555-0141',1,true,'Rafael','son','home',NULL,NULL,false,false,true,false,false,'Self-reported homeowner policy',false,true,true),
('443','Raymond Hughes',32.95325,-96.73341,'English','555-0143',4,false,'Denise','wife','home',NULL,NULL,false,true,false,true,false,NULL,NULL,true,true),
('445','Karen Mitchell',32.95325,-96.73315000000001,'English','555-0145',3,false,'Greg','husband','home',NULL,NULL,false,false,false,false,true,'Self-reported homeowner policy',false,true,true),
('447','Joe Patterson',32.95325,-96.73289,'English','555-0147',1,true,'Ruth','sister','family','Left Friday for sister''s in Waco',NULL,false,false,false,false,false,NULL,NULL,true,true),
('449','Maria Johnson',32.95325,-96.73263,'English','555-0149',4,false,'Andre','brother','home',NULL,'CPAP machine',false,false,false,false,false,'Self-reported homeowner policy',false,true,true),
('451','Tom Becker',32.95325,-96.73237,'English','555-0151',3,false,'Sam','friend','home',NULL,NULL,false,false,false,false,false,NULL,NULL,true,true),
('453','Aisha Bello',32.95325,-96.73211,'English','555-0153',1,true,'Sam','friend','home',NULL,NULL,false,false,false,false,false,'Self-reported homeowner policy',false,true,true),
('455','Luis Romero',32.95325,-96.73185000000001,'Spanish','555-0155',4,false,'Sam','friend','home',NULL,NULL,false,false,false,false,true,NULL,NULL,true,true),
('457','Yusuf Karim',32.95325,-96.73159000000001,'Arabic','555-0157',3,false,'Huda','wife','home',NULL,NULL,false,false,false,false,false,'Self-reported homeowner policy',false,true,true)
) AS demo(id,name,lat,lng,language,phone,household_size,lives_alone,contact_name,contact_relation,plan,plan_detail,power_equipment,critical,mobility,transportation,accessible,pets,carrier,documents_ready,voice_calls,contact_consent)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.resources (id,name,lat,lng,status,accessible,generator,pets,capacity,population,source,updated_at)
VALUES
('syn-richardson-civic','Richardson Civic Center (synthetic)',32.9483,-96.7299,'open',true,true,false,250,92,'Synthetic demo data',NULL),
('syn-heights-rec','Heights Recreation Center (synthetic)',32.9595,-96.7712,'open',true,false,true,120,41,'Synthetic demo data',NULL),
('syn-utd-activity','University Activity Center (synthetic)',32.9857,-96.7502,'open',true,true,true,400,380,'Synthetic demo data',NULL),
('syn-duck-creek-church','Duck Creek Community Church (synthetic)',32.9437,-96.7108,'open',false,false,false,60,18,'Synthetic demo data',NULL)
ON CONFLICT (id) DO NOTHING;