import {
  demoCars,
  demoDocuments,
  demoInvites,
  demoMaintenance,
  demoNotifications,
  demoProfile,
  demoRentals,
} from '@/lib/demo-data'
import { getDocumentUrgency } from '@/lib/format'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type {
  Car,
  CarDocument,
  CarPhoto,
  DocumentType,
  FleetAccess,
  Maintenance,
  MaintenanceDocument,
  NotificationItem,
  Profile,
  Rental,
  RentalPriceSegment,
} from '@/types/models'

interface AppDataState {
  profile: Profile
  cars: Car[]
  carPhotos: CarPhoto[]
  documents: CarDocument[]
  rentals: Rental[]
  maintenance: Maintenance[]
  notifications: NotificationItem[]
  invites: FleetAccess[]
  incomingInvites: FleetAccess[]
}

interface DeferredAssetsState {
  carPhotos: CarPhoto[]
  maintenanceDocuments: MaintenanceDocument[]
}

interface AppUser {
  id: string
  email: string
  fullName: string
}

type RemoteProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  created_at: string | null
}

type RemoteCarRow = {
  id: string
  owner_id: string
  license_plate: string
  brand: string
  model: string
  year: number | null
  color: string | null
  engine_hp: number
  engine_kw: number
  engine_displacement: number
  transmission: Car['transmission']
  chassis_number: string
  category: Car['category']
  status: Car['status']
  purchase_price: number | null
  purchase_currency: Car['purchaseCurrency'] | null
  notes: string | null
  service_return_date: string | null
  current_km: number | null
  archived_at: string | null
  created_at: string | null
  updated_at: string | null
}

type RemoteDocumentRow = {
  id: string
  car_id: string
  type: CarDocument['type']
  custom_name: string | null
  expiry_date: string | null
  issue_date: string | null
  file_url: string | null
  notes: string | null
  is_mandatory: boolean | null
  created_at: string | null
}

type RemoteCarPhotoRow = {
  id: string
  car_id: string
  file_url: string
  description: string | null
  created_at: string | null
}

type RemoteRentalRow = {
  id: string
  car_id: string
  renter_name: string
  renter_surname: string
  renter_cnp: string
  renter_id_photo_url: string | null
  start_date: string
  end_date: string
  advance_payment: number | null
  status: Rental['status']
  notes: string | null
  km_start: number | null
  km_end: number | null
  created_at: string | null
  updated_at: string | null
}

type RemoteSegmentRow = {
  id: string
  rental_id: string
  price_per_unit: number
  price_unit: RentalPriceSegment['priceUnit']
  start_date: string
  end_date: string
  created_at: string | null
}

type RemoteMaintenanceRow = {
  id: string
  car_id: string
  type: Maintenance['type'] | 'service'
  description: string
  cost: number
  date_performed: string
  expected_completion_date: string | null
  km_at_service: number | null
  notes: string | null
  created_at: string | null
}

type RemoteMaintenanceDocumentRow = {
  id: string
  maintenance_id: string
  file_url: string
  file_name: string | null
  created_at: string | null
}

type RemoteFleetAccessRow = {
  id: string
  owner_id: string
  invited_email: string
  role: FleetAccess['role'] | null
  accepted_at: string | null
  accepted_user_id?: string | null
  created_at: string | null
}

type RemoteNotificationRow = {
  id: string
  user_id: string
  car_id: string | null
  document_id: string | null
  title: string
  message: string
  type: NotificationItem['type'] | null
  is_read: boolean | null
  created_at: string | null
}

function table(name: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from(name as never) as any
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function normalizeLicensePlate(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

function normalizeLicensePlateKey(value: string) {
  return normalizeLicensePlate(value).replace(/[^A-Z0-9]/g, '')
}

function normalizeChassisNumber(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

function isOrderedDateRange(startDate: string, endDate: string) {
  return Boolean(startDate && endDate && startDate <= endDate)
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && startB <= endA
}

async function uploadPrivateFile(bucket: string, path: string, file: File) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false })
  if (error) {
    throw new Error(getStorageErrorMessage(bucket, error.message))
  }

  return path
}

async function removeStorageFiles(bucket: string, paths: Array<string | undefined | null>) {
  const uniquePaths = Array.from(new Set(paths.filter((path): path is string => Boolean(path))))

  if (uniquePaths.length === 0) {
    return
  }

  const { error } = await supabase.storage.from(bucket).remove(uniquePaths)
  if (error) {
    throw new Error(getStorageErrorMessage(bucket, error.message))
  }
}

async function tryRemoveStorageFiles(bucket: string, paths: Array<string | undefined | null>) {
  try {
    await removeStorageFiles(bucket, paths)
  } catch {
    // Best-effort cleanup for rollback paths and replaced files.
  }
}

async function createSignedUrlMap(bucket: string, paths: Array<string | undefined | null>) {
  const uniquePaths = Array.from(new Set(paths.filter((path): path is string => Boolean(path))))

  if (uniquePaths.length === 0) {
    return new Map<string, string>()
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(uniquePaths, 60 * 60 * 6)

  if (error || !data) {
    return new Map(uniquePaths.map((path) => [path, path]))
  }

  return new Map(uniquePaths.map((path, index) => [path, data[index]?.signedUrl ?? path]))
}

function getDocumentDefaultName(type: DocumentType) {
  return {
    ITP: 'ITP',
    RCA: 'RCA',
    CASCO: 'CASCO',
    ROVINIETA: 'Rovinietă',
    TALON: 'Talon',
    CI_VEHICUL: 'Carte identitate vehicul',
    OTHER: 'Alt document',
  }[type]
}

type CarDocumentSnapshot = Pick<
  RemoteDocumentRow,
  'id' | 'car_id' | 'type' | 'custom_name' | 'expiry_date' | 'issue_date' | 'file_url' | 'notes' | 'is_mandatory' | 'created_at'
>

type SyncCarDocumentsResult = {
  previousDocuments: CarDocumentSnapshot[]
  uploadedPaths: string[]
  obsoletePaths: string[]
}

type UploadBatchResult = {
  uploadedPaths: string[]
  insertedIds: string[]
}

function normalizeDocumentInputs(input: CarWriteInput) {
  const providedDocuments = input.documentInputs ?? []
  const mandatoryTypes = new Set<DocumentType>(['ITP', 'RCA'])
  const normalized = [
    {
      id: providedDocuments.find((document) => document.type === 'ITP')?.id,
      type: 'ITP' as const,
      customName: 'ITP',
      expiryDate: input.itpExpiryDate,
      file: providedDocuments.find((document) => document.type === 'ITP')?.file ?? null,
    },
    {
      id: providedDocuments.find((document) => document.type === 'RCA')?.id,
      type: 'RCA' as const,
      customName: 'RCA',
      expiryDate: input.rcaExpiryDate,
      file: providedDocuments.find((document) => document.type === 'RCA')?.file ?? null,
    },
    ...providedDocuments
      .filter((document) => !mandatoryTypes.has(document.type))
      .map((document) => ({
        ...document,
        customName: document.customName?.trim(),
        expiryDate: document.expiryDate?.trim(),
        file: document.file ?? null,
      })),
  ]

  const seenTypes = new Set<DocumentType>()

  normalized.forEach((document) => {
    if (document.type === 'OTHER') {
      if (!document.id && !document.customName && !document.expiryDate && !document.file) {
        return
      }

      if (!document.customName) {
        throw new Error('Completeaza numele pentru documentul de tip Altele.')
      }
      return
    }

    if (seenTypes.has(document.type)) {
      throw new Error(`Documentul ${getDocumentDefaultName(document.type)} este adaugat de mai multe ori.`)
    }

    seenTypes.add(document.type)
  })

  return normalized.filter(
    (document) =>
      document.type === 'ITP' ||
      document.type === 'RCA' ||
      Boolean(document.id || document.expiryDate || document.file || document.customName),
  )
}

async function fetchCarDocumentsSnapshot(carId: string) {
  const result = await table('car_documents').select('id, car_id, type, custom_name, expiry_date, issue_date, file_url, notes, is_mandatory, created_at').eq('car_id', carId)

  if (result.error) {
    throw new Error(result.error.message)
  }

  return (result.data ?? []) as CarDocumentSnapshot[]
}

async function restoreCarDocumentsSnapshot(carId: string, previousDocuments: CarDocumentSnapshot[]) {
  const currentDocuments = await fetchCarDocumentsSnapshot(carId)
  const previousIds = new Set(previousDocuments.map((document) => document.id))
  const currentIds = new Set(currentDocuments.map((document) => document.id))

  if (previousDocuments.length > 0) {
    const restoreResult = await table('car_documents').upsert(
      previousDocuments.map((document) => ({
        id: document.id,
        car_id: document.car_id,
        type: document.type,
        custom_name: document.custom_name,
        expiry_date: document.expiry_date,
        issue_date: document.issue_date,
        file_url: document.file_url,
        notes: document.notes,
        is_mandatory: document.is_mandatory ?? false,
        created_at: document.created_at,
      })),
      { onConflict: 'id' },
    )

    if (restoreResult.error) {
      throw new Error(restoreResult.error.message)
    }
  }

  const deleteIds = currentDocuments.filter((document) => !previousIds.has(document.id)).map((document) => document.id)

  if (deleteIds.length > 0) {
    const deleteResult = await table('car_documents').delete().in('id', deleteIds)

    if (deleteResult.error) {
      throw new Error(deleteResult.error.message)
    }
  }

  const missingPreviousDocuments = previousDocuments.filter((document) => !currentIds.has(document.id))
  if (missingPreviousDocuments.length > 0) {
    const restoreMissingResult = await table('car_documents').upsert(
      missingPreviousDocuments.map((document) => ({
        id: document.id,
        car_id: document.car_id,
        type: document.type,
        custom_name: document.custom_name,
        expiry_date: document.expiry_date,
        issue_date: document.issue_date,
        file_url: document.file_url,
        notes: document.notes,
        is_mandatory: document.is_mandatory ?? false,
        created_at: document.created_at,
      })),
      { onConflict: 'id' },
    )

    if (restoreMissingResult.error) {
      throw new Error(restoreMissingResult.error.message)
    }
  }
}

async function syncCarDocuments(car: Car, input: CarWriteInput): Promise<SyncCarDocumentsResult> {
  const normalizedDocuments = normalizeDocumentInputs(input)
  const mandatoryDocuments = new Map(normalizedDocuments.filter((document) => document.type === 'ITP' || document.type === 'RCA').map((document) => [document.type, document]))

  if (!mandatoryDocuments.get('ITP')?.expiryDate) {
    throw new Error('Completeaza data de expirare pentru ITP.')
  }

  if (!mandatoryDocuments.get('RCA')?.expiryDate) {
    throw new Error('Completeaza data de expirare pentru RCA.')
  }

  const existingDocuments = await fetchCarDocumentsSnapshot(car.id)
  const resolvedDocuments = normalizedDocuments.map((document) => ({ ...document, id: document.id ?? crypto.randomUUID() }))
  const existingDocumentMap = new Map(existingDocuments.map((document) => [document.id, document]))
  const uploadedPaths: string[] = []
  const newFilePathByDocumentId = new Map<string, string>()
  const submittedIds = new Set(resolvedDocuments.map((document) => document.id))
  const documentsToDelete = existingDocuments.filter((document) => !submittedIds.has(document.id))

  try {
    for (const document of resolvedDocuments) {
      if (!document.file) {
        continue
      }

      const extension = document.file.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const path = `${car.ownerId}/${car.id}/${crypto.randomUUID()}.${extension}`
      const uploadedPath = await uploadPrivateFile('car-documents', path, document.file)
      uploadedPaths.push(uploadedPath)
      newFilePathByDocumentId.set(document.id, uploadedPath)
    }

    const upsertResult = await table('car_documents').upsert(
      resolvedDocuments.map((document) => ({
        id: document.id,
        car_id: car.id,
        type: document.type,
        custom_name: document.type === 'OTHER' ? document.customName ?? getDocumentDefaultName(document.type) : getDocumentDefaultName(document.type),
        expiry_date: document.expiryDate ?? null,
        file_url: newFilePathByDocumentId.get(document.id) ?? existingDocumentMap.get(document.id)?.file_url ?? null,
        is_mandatory: document.type === 'ITP' || document.type === 'RCA',
      })),
      { onConflict: 'id' },
    )

    if (upsertResult.error) {
      throw new Error(upsertResult.error.message)
    }

    if (documentsToDelete.length > 0) {
      const deleteResult = await table('car_documents').delete().in('id', documentsToDelete.map((document) => document.id))

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message)
      }
    }

    const replacedFilePaths = resolvedDocuments
      .filter((document) => newFilePathByDocumentId.has(document.id) && existingDocumentMap.get(document.id)?.file_url)
      .map((document) => existingDocumentMap.get(document.id)?.file_url)

    return {
      previousDocuments: existingDocuments,
      uploadedPaths,
      obsoletePaths: [...documentsToDelete.map((document) => document.file_url), ...replacedFilePaths].filter(
        (path): path is string => Boolean(path),
      ),
    }
  } catch (error) {
    await tryRemoveStorageFiles('car-documents', uploadedPaths)
    throw error
  }
}

async function refreshRemoteCarStatus(carId: string) {
  const [carResult, rentalsResult] = await Promise.all([
    table('cars').select('status').eq('id', carId).maybeSingle(),
    table('rentals').select('id').eq('car_id', carId).eq('status', 'active'),
  ])

  if (carResult.error) {
    throw new Error(carResult.error.message)
  }

  if (rentalsResult.error) {
    throw new Error(rentalsResult.error.message)
  }

  const currentStatus = carResult.data?.status as Car['status'] | undefined
  const nextStatus = rentalsResult.data && rentalsResult.data.length > 0 ? 'rented' : currentStatus === 'rented' ? 'available' : currentStatus

  if (!nextStatus || nextStatus === currentStatus) {
    return
  }

  const update = await table('cars').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', carId)
  if (update.error) {
    throw new Error(update.error.message)
  }
}

async function addCarPhotos(car: Car, files: File[]): Promise<UploadBatchResult> {
  const uploadedPaths: string[] = []
  const insertedIds: string[] = []

  try {
    for (const file of files) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${car.ownerId}/${car.id}/${crypto.randomUUID()}.${extension}`
      const fileUrl = await uploadPrivateFile('car-photos', path, file)
      uploadedPaths.push(fileUrl)

      const uploaded = await table('car_photos').insert({
        car_id: car.id,
        file_url: fileUrl,
        description: file.name,
      }).select('id').single()

      if (uploaded.error) {
        throw new Error(uploaded.error.message)
      }

      insertedIds.push((uploaded.data as { id: string }).id)
    }

    return { uploadedPaths, insertedIds }
  } catch (error) {
    if (insertedIds.length > 0) {
      await table('car_photos').delete().in('id', insertedIds)
    }

    await tryRemoveStorageFiles('car-photos', uploadedPaths)
    throw error
  }
}

async function addMaintenanceDocuments(
  user: AppUser,
  maintenanceId: string,
  files: File[],
): Promise<UploadBatchResult> {
  const uploadedPaths: string[] = []
  const insertedIds: string[] = []

  try {
    for (const file of files) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const path = `${user.id}/${maintenanceId}/${crypto.randomUUID()}.${extension}`
      const fileUrl = await uploadPrivateFile('maintenance-documents', path, file)
      uploadedPaths.push(fileUrl)

      const uploaded = await table('maintenance_documents').insert({
        maintenance_id: maintenanceId,
        file_url: fileUrl,
        file_name: file.name,
      }).select('id').single()

      if (uploaded.error) {
        throw new Error(uploaded.error.message)
      }

      insertedIds.push((uploaded.data as { id: string }).id)
    }

    return { uploadedPaths, insertedIds }
  } catch (error) {
    if (insertedIds.length > 0) {
      await table('maintenance_documents').delete().in('id', insertedIds)
    }

    await tryRemoveStorageFiles('maintenance-documents', uploadedPaths)
    throw error
  }
}

async function rollbackCreatedCar(carId: string) {
  const [documentsResult, carPhotosResult, maintenanceResult] = await Promise.all([
    table('car_documents').select('file_url').eq('car_id', carId),
    table('car_photos').select('file_url').eq('car_id', carId),
    table('maintenance').select('id').eq('car_id', carId),
  ])

  const maintenanceIds = ((maintenanceResult.data ?? []) as Array<{ id: string }>).map((item) => item.id)
  const maintenanceDocumentsResult =
    maintenanceIds.length > 0
      ? await table('maintenance_documents').select('file_url').in('maintenance_id', maintenanceIds)
      : { data: [], error: null }

  await tryRemoveStorageFiles(
    'car-documents',
    ((documentsResult.data ?? []) as Array<{ file_url: string | null }>).map((document) => document.file_url),
  )
  await tryRemoveStorageFiles(
    'car-photos',
    ((carPhotosResult.data ?? []) as Array<{ file_url: string | null }>).map((photo) => photo.file_url),
  )
  await tryRemoveStorageFiles(
    'maintenance-documents',
    ((maintenanceDocumentsResult.data ?? []) as Array<{ file_url: string | null }>).map((document) => document.file_url),
  )

  await table('cars').delete().eq('id', carId)
}

async function rollbackCreatedMaintenance(maintenanceId: string) {
  const documentsResult = await table('maintenance_documents').select('file_url').eq('maintenance_id', maintenanceId)

  await tryRemoveStorageFiles(
    'maintenance-documents',
    ((documentsResult.data ?? []) as Array<{ file_url: string | null }>).map((document) => document.file_url),
  )

  await table('maintenance').delete().eq('id', maintenanceId)
}

async function restoreMaintenanceRow(previousMaintenance: RemoteMaintenanceRow) {
  const restoreResult = await table('maintenance').update(buildMaintenancePayloadFromRow(previousMaintenance)).eq('id', previousMaintenance.id)

  if (restoreResult.error) {
    throw new Error(restoreResult.error.message)
  }
}

function assertDemoMaintenanceStatusAllowed(
  state: AppDataState,
  input: Omit<Maintenance, 'id' | 'createdAt' | 'documents'> & {
    id?: string
    documentFiles?: File[]
    markCarAsMaintenance?: boolean
  },
) {
  if (!input.markCarAsMaintenance) {
    return
  }

  const selectedCar = state.cars.find((car) => car.id === input.carId)

  if (selectedCar?.status === 'archived') {
    throw new Error('Nu poți marca o mașină arhivată ca fiind în service.')
  }

  if (hasDemoActiveRentals(state, input.carId)) {
    throw new Error('Nu poți marca mașina ca fiind în service cât timp are o închiriere activă.')
  }
}

async function assertRemoteMaintenanceStatusAllowed(
  input: Omit<Maintenance, 'id' | 'createdAt' | 'documents'> & {
    id?: string
    documentFiles?: File[]
    markCarAsMaintenance?: boolean
  },
) {
  if (!input.markCarAsMaintenance) {
    return
  }

  const [carResult, hasActiveRental] = await Promise.all([
    table('cars').select('status').eq('id', input.carId).maybeSingle(),
    hasRemoteActiveRentals(input.carId),
  ])

  if (carResult.error) {
    throw new Error(carResult.error.message)
  }

  if ((carResult.data?.status as Car['status'] | undefined) === 'archived') {
    throw new Error('Nu poți marca o mașină arhivată ca fiind în service.')
  }

  if (hasActiveRental) {
    throw new Error('Nu poți marca mașina ca fiind în service cât timp are o închiriere activă.')
  }
}

async function assertRemoteRentalStatusAllowed(
  input: Omit<Rental, 'id' | 'createdAt' | 'updatedAt' | 'photos'> & { id?: string },
) {
  if (input.status !== 'active') {
    return
  }

  const { data, error } = await table('cars').select('status').eq('id', input.carId).maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  const status = data?.status as Car['status'] | undefined

  if (status === 'maintenance') {
    throw new Error('Nu poți începe o închiriere pentru o mașină aflată în service.')
  }

  if (status === 'archived') {
    throw new Error('Nu poți începe o închiriere pentru o mașină arhivată.')
  }
}

function assertDemoRentalStatusAllowed(
  state: AppDataState,
  input: Omit<Rental, 'id' | 'createdAt' | 'updatedAt' | 'photos'> & { id?: string },
) {
  if (input.status !== 'active') {
    return
  }

  const selectedCar = state.cars.find((car) => car.id === input.carId)

  if (selectedCar?.status === 'maintenance') {
    throw new Error('Nu poți începe o închiriere pentru o mașină aflată în service.')
  }

  if (selectedCar?.status === 'archived') {
    throw new Error('Nu poți începe o închiriere pentru o mașină arhivată.')
  }
}

function getStorageErrorMessage(bucket: string, message: string) {
  const normalized = message.toLowerCase()

  if (normalized.includes('bucket')) {
    return `Bucket-ul ${bucket} nu este configurat in Supabase. Ruleaza migrarile noi pentru storage si incearca din nou.`
  }

  if (normalized.includes('row-level security') || normalized.includes('permission')) {
    return `Nu există permisiunile necesare pentru upload în bucket-ul ${bucket}. Rulează migrările noi pentru storage și încearcă din nou.`
  }

  return message
}

function createDemoFileUrl(file: File) {
  return URL.createObjectURL(file)
}

function revokeDemoBlobUrls(urls: Array<string | undefined | null>) {
  urls.forEach((url) => {
    if (!url?.startsWith('blob:')) {
      return
    }

    try {
      URL.revokeObjectURL(url)
    } catch {
      // Best-effort cleanup for demo-only previews.
    }
  })
}

function revokeDemoStateFileUrls(state: AppDataState) {
  revokeDemoBlobUrls([
    ...state.carPhotos.map((photo) => photo.fileUrl),
    ...state.documents.map((document) => document.fileUrl),
    ...state.maintenance.flatMap((item) => item.documents.map((document) => document.fileUrl)),
  ])
}

type CarWriteInput = Omit<Car, 'id' | 'engineKw' | 'createdAt' | 'updatedAt'> & {
  id?: string
  itpExpiryDate: string
  rcaExpiryDate: string
  photoFiles?: File[]
  documentInputs?: Array<{
    id?: string
    type: DocumentType
    customName?: string
    expiryDate?: string
    file?: File | null
  }>
}

function normalizeCarInput(input: CarWriteInput): CarWriteInput {
  return {
    ...input,
    licensePlate: normalizeLicensePlate(input.licensePlate),
    chassisNumber: normalizeChassisNumber(input.chassisNumber),
    category: input.category ?? 'general',
    purchaseCurrency: input.purchaseCurrency ?? 'RON',
    serviceReturnDate: input.status === 'maintenance' ? input.serviceReturnDate ?? undefined : undefined,
  }
}

function buildCarPayloadFromInput(input: CarWriteInput) {
  return {
    owner_id: input.ownerId,
    license_plate: input.licensePlate,
    brand: input.brand,
    model: input.model,
    year: input.year ?? null,
    color: input.color ?? null,
    engine_hp: input.engineHp,
    engine_displacement: input.engineDisplacement,
    transmission: input.transmission,
    chassis_number: input.chassisNumber,
    category: input.category,
    status: input.status,
    purchase_price: input.purchasePrice ?? null,
    purchase_currency: input.purchaseCurrency,
    notes: input.notes ?? null,
    service_return_date: input.status === 'maintenance' ? input.serviceReturnDate ?? null : null,
    current_km: input.currentKm,
    archived_at: input.archivedAt ?? null,
    updated_at: new Date().toISOString(),
  }
}

function buildCarPayloadFromRow(row: RemoteCarRow) {
  return {
    owner_id: row.owner_id,
    license_plate: row.license_plate,
    brand: row.brand,
    model: row.model,
    year: row.year,
    color: row.color,
    engine_hp: row.engine_hp,
    engine_displacement: row.engine_displacement,
    transmission: row.transmission,
    chassis_number: row.chassis_number,
    category: row.category,
    status: row.status,
    purchase_price: row.purchase_price,
    purchase_currency: row.purchase_currency ?? 'RON',
    notes: row.notes,
    service_return_date: row.service_return_date,
    current_km: row.current_km,
    archived_at: row.archived_at,
    updated_at: row.updated_at ?? new Date().toISOString(),
  }
}

function buildMaintenancePayloadFromRow(row: RemoteMaintenanceRow) {
  return {
    car_id: row.car_id,
    type: row.type,
    description: row.description,
    cost: row.cost,
    date_performed: row.date_performed,
    expected_completion_date: row.expected_completion_date,
    km_at_service: row.km_at_service,
    notes: row.notes,
  }
}

function compareMaintenanceRecency(
  first: Pick<Maintenance, 'id' | 'datePerformed' | 'createdAt'>,
  second: Pick<Maintenance, 'id' | 'datePerformed' | 'createdAt'>,
) {
  if (first.datePerformed !== second.datePerformed) {
    return second.datePerformed.localeCompare(first.datePerformed)
  }

  if (first.createdAt !== second.createdAt) {
    return second.createdAt.localeCompare(first.createdAt)
  }

  return second.id.localeCompare(first.id)
}

function getLatestDemoMaintenanceForCar(state: AppDataState, carId: string) {
  return [...state.maintenance.filter((item) => item.carId === carId)].sort(compareMaintenanceRecency)[0]
}

function syncDemoCarServiceReturnDateFromLatestMaintenance(
  state: AppDataState,
  carId: string,
  options: { forceMaintenanceStatus?: boolean } = {},
) {
  const currentCar = state.cars.find((item) => item.id === carId)

  if (!currentCar) {
    return
  }

  if (!options.forceMaintenanceStatus && currentCar.status !== 'maintenance') {
    return
  }

  const latestMaintenance = getLatestDemoMaintenanceForCar(state, carId)
  const now = new Date().toISOString()

  state.cars = state.cars.map((item) =>
    item.id === carId
      ? {
          ...item,
          status: options.forceMaintenanceStatus ? 'maintenance' : item.status,
          serviceReturnDate: latestMaintenance?.expectedCompletionDate ?? undefined,
          updatedAt: now,
        }
      : item,
  )
}

function syncDemoLatestMaintenanceExpectedCompletionFromCar(
  state: AppDataState,
  carId: string,
  serviceReturnDate?: string,
) {
  const latestMaintenance = getLatestDemoMaintenanceForCar(state, carId)

  if (!latestMaintenance) {
    return
  }

  state.maintenance = state.maintenance.map((item) =>
    item.id === latestMaintenance.id
      ? {
          ...item,
          expectedCompletionDate: serviceReturnDate ?? undefined,
        }
      : item,
  )
}

async function getLatestRemoteMaintenanceForCar(carId: string) {
  const { data, error } = await table('maintenance')
    .select('*')
    .eq('car_id', carId)
    .order('date_performed', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? [])[0] as RemoteMaintenanceRow | undefined) ?? null
}

async function syncRemoteCarServiceReturnDateFromLatestMaintenance(
  carId: string,
  options: { forceMaintenanceStatus?: boolean } = {},
) {
  const [latestMaintenance, carResult] = await Promise.all([
    getLatestRemoteMaintenanceForCar(carId),
    table('cars').select('status').eq('id', carId).maybeSingle(),
  ])

  if (carResult.error) {
    throw new Error(carResult.error.message)
  }

  const currentStatus = carResult.data?.status as Car['status'] | undefined

  if (!currentStatus) {
    return
  }

  if (!options.forceMaintenanceStatus && currentStatus !== 'maintenance') {
    return
  }

  const { error } = await table('cars')
    .update({
      status: options.forceMaintenanceStatus ? 'maintenance' : currentStatus,
      service_return_date: latestMaintenance?.expected_completion_date ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', carId)

  if (error) {
    throw new Error(error.message)
  }
}

async function syncRemoteLatestMaintenanceExpectedCompletionFromCar(
  carId: string,
  serviceReturnDate?: string,
) {
  const latestMaintenance = await getLatestRemoteMaintenanceForCar(carId)

  if (!latestMaintenance) {
    return null
  }

  const { error } = await table('maintenance')
    .update({
      expected_completion_date: serviceReturnDate ?? null,
    })
    .eq('id', latestMaintenance.id)

  if (error) {
    throw new Error(error.message)
  }

  return latestMaintenance
}

async function hasRemoteActiveRentals(carId: string, excludeRentalId?: string) {
  const query = table('rentals').select('id').eq('car_id', carId).eq('status', 'active')

  if (excludeRentalId) {
    query.neq('id', excludeRentalId)
  }

  const { data, error } = await query.limit(1)
  if (error) {
    throw new Error(error.message)
  }

  return Boolean((data ?? []).length)
}

function hasDemoActiveRentals(state: AppDataState, carId: string, excludeRentalId?: string) {
  return state.rentals.some((rental) => rental.carId === carId && rental.status === 'active' && rental.id !== excludeRentalId)
}

function assertDemoCarStatusAllowed(state: AppDataState, input: CarWriteInput) {
  const hasActiveRental = input.id ? hasDemoActiveRentals(state, input.id) : false

  if (hasActiveRental && input.status !== 'rented') {
    throw new Error('Mașina are o închiriere activă și trebuie să rămână în starea Închiriată.')
  }

  if (!hasActiveRental && input.status === 'rented') {
    throw new Error('Nu poți marca mașina ca Închiriată fără o închiriere activă.')
  }
}

async function assertRemoteCarStatusAllowed(input: CarWriteInput) {
  if (!input.id) {
    if (input.status === 'rented') {
      throw new Error('Nu poți marca mașina ca Închiriată fără o închiriere activă.')
    }
    return
  }

  const hasActiveRental = await hasRemoteActiveRentals(input.id)

  if (hasActiveRental && input.status !== 'rented') {
    throw new Error('Mașina are o închiriere activă și trebuie să rămână în starea Închiriată.')
  }

  if (!hasActiveRental && input.status === 'rented') {
    throw new Error('Nu poți marca mașina ca Închiriată fără o închiriere activă.')
  }
}

function getCarDuplicateMessage(conflict: { license_plate: string; chassis_number: string }, input: CarWriteInput) {
  if (normalizeLicensePlateKey(conflict.license_plate) === normalizeLicensePlateKey(input.licensePlate)) {
    return 'Există deja o mașină cu acest număr de înmatriculare în flota selectată.'
  }

  return 'Există deja o mașină cu această serie de șasiu în flota selectată.'
}

function ensureDemoCarIdentifiersAvailable(state: AppDataState, input: CarWriteInput) {
  const conflict = state.cars.find(
    (car) =>
      car.id !== input.id &&
      car.ownerId === input.ownerId &&
      (normalizeLicensePlateKey(car.licensePlate) === normalizeLicensePlateKey(input.licensePlate) ||
        normalizeChassisNumber(car.chassisNumber) === normalizeChassisNumber(input.chassisNumber)),
  )

  if (conflict) {
    throw new Error(
      normalizeLicensePlateKey(conflict.licensePlate) === normalizeLicensePlateKey(input.licensePlate)
        ? 'Există deja o mașină cu acest număr de înmatriculare în flota selectată.'
        : 'Există deja o mașină cu această serie de șasiu în flota selectată.',
    )
  }
}

async function ensureRemoteCarIdentifiersAvailable(input: CarWriteInput) {
  const query = table('cars')
    .select('id, license_plate, chassis_number')
    .eq('owner_id', input.ownerId)

  if (input.id) {
    query.neq('id', input.id)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(error.message)
  }

  const conflict = ((data ?? []) as Array<Pick<RemoteCarRow, 'id' | 'license_plate' | 'chassis_number'>>).find(
    (car) =>
      normalizeLicensePlateKey(car.license_plate) === normalizeLicensePlateKey(input.licensePlate) ||
      normalizeChassisNumber(car.chassis_number) === normalizeChassisNumber(input.chassisNumber),
  )

  if (conflict) {
    throw new Error(getCarDuplicateMessage(conflict, input))
  }
}

function assertValidRentalInput(input: Omit<Rental, 'id' | 'createdAt' | 'updatedAt' | 'photos'> & { id?: string }) {
  if (!isOrderedDateRange(input.startDate, input.endDate)) {
    throw new Error('Data de sfârșit nu poate fi înaintea datei de început.')
  }

  if (input.kmStart !== undefined && input.kmEnd !== undefined && input.kmEnd < input.kmStart) {
    throw new Error('Kilometrajul de retur nu poate fi mai mic decat cel de predare.')
  }

  if (input.segments.length === 0) {
    throw new Error('Adaugă cel puțin un segment de preț.')
  }

  const seen = new Set<string>()

  input.segments.forEach((segment, index) => {
    if (!isOrderedDateRange(segment.startDate, segment.endDate)) {
      throw new Error('Segmentul de pret are o perioada invalida.')
    }

    if (segment.startDate < input.startDate || segment.endDate > input.endDate) {
      throw new Error('Segmentele de pret trebuie sa fie incluse in perioada inchirierii.')
    }

    if (segment.pricePerUnit <= 0) {
      throw new Error('Pretul segmentului trebuie sa fie mai mare decat zero.')
    }

    const key = `${segment.startDate}-${segment.endDate}-${segment.pricePerUnit}-${segment.priceUnit}`
    if (seen.has(key)) {
      throw new Error('Acest segment de pret este deja adaugat.')
    }
    seen.add(key)

    input.segments.forEach((otherSegment, otherIndex) => {
      if (index >= otherIndex) return

      if (rangesOverlap(segment.startDate, segment.endDate, otherSegment.startDate, otherSegment.endDate)) {
        throw new Error('Segmentele de pret nu se pot suprapune.')
      }
    })
  })
}

async function ensureRemoteRentalAvailability(
  input: Omit<Rental, 'id' | 'createdAt' | 'updatedAt' | 'photos'> & { id?: string },
) {
  if (input.status === 'cancelled') {
    return
  }

  const query = table('rentals')
    .select('id, start_date, end_date')
    .eq('car_id', input.carId)
    .neq('status', 'cancelled')

  if (input.id) {
    query.neq('id', input.id)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(error.message)
  }

  const hasConflict = ((data ?? []) as Array<Pick<RemoteRentalRow, 'id' | 'start_date' | 'end_date'>>).some((rental) =>
    rangesOverlap(input.startDate, input.endDate, rental.start_date, rental.end_date),
  )

  if (hasConflict) {
    throw new Error('Mașina este deja închiriată în perioada selectată.')
  }
}

function ensureDemoRentalAvailability(
  state: AppDataState,
  input: Omit<Rental, 'id' | 'createdAt' | 'updatedAt' | 'photos'> & { id?: string },
) {
  if (input.status === 'cancelled') {
    return
  }

  const hasConflict = state.rentals.some(
    (rental) =>
      rental.id !== input.id &&
      rental.carId === input.carId &&
      rental.status !== 'cancelled' &&
      rangesOverlap(input.startDate, input.endDate, rental.startDate, rental.endDate),
  )

  if (hasConflict) {
    throw new Error('Mașina este deja închiriată în perioada selectată.')
  }
}

function refreshDemoCarStatuses(state: AppDataState, carIds: string[]) {
  if (carIds.length === 0) {
    return
  }

  const now = new Date().toISOString()
  const affectedCarIds = new Set(carIds)

  state.cars = state.cars.map((car) => {
    if (!affectedCarIds.has(car.id)) {
      return car
    }

    const hasActiveRental = state.rentals.some((rental) => rental.carId === car.id && rental.status === 'active')
    const nextStatus = hasActiveRental ? 'rented' : car.status === 'rented' ? 'available' : car.status

    if (nextStatus === car.status) {
      return car
    }

    return {
      ...car,
      status: nextStatus,
      updatedAt: now,
    }
  })
}

function isDemoUser(user: AppUser) {
  return user.id === 'demo-user' || !isSupabaseConfigured
}

function getStorageKey(userId: string) {
  return `mycars-state-${userId}`
}

function createDemoState(user: AppUser): AppDataState {
  if (user.id === 'demo-user') {
    return {
      profile: demoProfile,
      cars: demoCars,
      carPhotos: [],
      documents: demoDocuments,
      rentals: demoRentals,
      maintenance: demoMaintenance,
      notifications: demoNotifications,
      invites: demoInvites,
      incomingInvites: [],
    }
  }

  return {
    profile: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      createdAt: new Date().toISOString(),
    },
    cars: [],
    carPhotos: [],
    documents: [],
    rentals: [],
    maintenance: [],
    notifications: [],
    invites: [],
    incomingInvites: [],
  }
}

function readStoredDemoState(userId: string) {
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    return raw ? (JSON.parse(raw) as AppDataState) : null
  } catch {
    return null
  }
}

function readDemoState(user: AppUser) {
  const storageKey = getStorageKey(user.id)
  const raw = localStorage.getItem(storageKey)

  if (!raw) {
    const state = createDemoState(user)
    localStorage.setItem(storageKey, JSON.stringify(state))
    return state
  }

  try {
    return JSON.parse(raw) as AppDataState
  } catch {
    const state = createDemoState(user)
    localStorage.setItem(storageKey, JSON.stringify(state))
    return state
  }
}

function writeDemoState(userId: string, state: AppDataState) {
  localStorage.setItem(getStorageKey(userId), JSON.stringify(state))
}

function getNotificationReadKey(userId: string) {
  return `mycars-notification-read-${userId}`
}

function readReadNotificationIds(userId: string) {
  try {
    const raw = localStorage.getItem(getNotificationReadKey(userId))
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function writeReadNotificationIds(userId: string, ids: string[]) {
  localStorage.setItem(getNotificationReadKey(userId), JSON.stringify(ids))
}

function getNotificationCreatedAt(document: CarDocument) {
  return document.expiryDate ? `${document.expiryDate}T00:00:00.000Z` : document.createdAt
}

function buildNotifications(documents: CarDocument[], userId: string, persistedNotifications: NotificationItem[] = []) {
  const readIds = new Set(readReadNotificationIds(userId))
  const persistedNotificationsByKey = new Map(
    persistedNotifications
      .filter((item) => item.documentId)
      .map((item) => [`${item.documentId}-${item.type}`, item] as const),
  )

  return documents
    .map((document) => {
      const urgency = getDocumentUrgency(document.expiryDate)
      if (urgency === 'ok') return null

      const notificationId = `doc-${document.id}`
      const persistedNotification = persistedNotificationsByKey.get(`${document.id}-${urgency}`)

      return {
        id: persistedNotification?.id ?? notificationId,
        userId: persistedNotification?.userId ?? userId,
        carId: persistedNotification?.carId ?? document.carId,
        documentId: document.id,
        title: persistedNotification?.title ?? `${document.type} necesită atenție`,
        message:
          persistedNotification?.message ??
          (document.expiryDate
            ? `Documentul ${document.customName ?? document.type} expiră la ${document.expiryDate}.`
            : `Documentul ${document.customName ?? document.type} nu are dată de expirare.`),
        type: urgency,
        isRead: persistedNotification?.isRead ?? readIds.has(notificationId),
        createdAt: persistedNotification?.createdAt ?? getNotificationCreatedAt(document),
      } satisfies NotificationItem
    })
    .filter(Boolean) as NotificationItem[]
}

function mapProfile(row: RemoteProfileRow | null, user: AppUser): Profile {
  return {
    id: row?.id ?? user.id,
    fullName: row?.full_name ?? user.fullName,
    email: user.email,
    createdAt: row?.created_at ?? new Date().toISOString(),
  }
}

function mapCar(row: RemoteCarRow): Car {
  return {
    id: row.id,
    ownerId: row.owner_id,
    licensePlate: row.license_plate,
    brand: row.brand,
    model: row.model,
    year: row.year ?? undefined,
    color: row.color ?? undefined,
    engineHp: row.engine_hp,
    engineKw: row.engine_kw,
    engineDisplacement: row.engine_displacement,
    transmission: row.transmission,
    chassisNumber: row.chassis_number,
    category: row.category,
    status: row.status,
    purchasePrice: row.purchase_price ?? undefined,
    purchaseCurrency: row.purchase_currency ?? 'RON',
    notes: row.notes ?? undefined,
    serviceReturnDate: row.service_return_date ?? undefined,
    currentKm: row.current_km ?? 0,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  }
}

function mapDocument(row: RemoteDocumentRow): CarDocument {
  return {
    id: row.id,
    carId: row.car_id,
    type: row.type,
    customName: row.custom_name ?? undefined,
    expiryDate: row.expiry_date ?? undefined,
    issueDate: row.issue_date ?? undefined,
    fileUrl: row.file_url ?? undefined,
    notes: row.notes ?? undefined,
    isMandatory: row.is_mandatory ?? false,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

function mapCarPhoto(row: RemoteCarPhotoRow): CarPhoto {
  return {
    id: row.id,
    carId: row.car_id,
    fileUrl: row.file_url,
    description: row.description ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

function mapSegment(row: RemoteSegmentRow): RentalPriceSegment {
  return {
    id: row.id,
    rentalId: row.rental_id,
    pricePerUnit: row.price_per_unit,
    priceUnit: row.price_unit,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

function mapRental(row: RemoteRentalRow, segments: RentalPriceSegment[]): Rental {
  return {
    id: row.id,
    carId: row.car_id,
    renterName: row.renter_name,
    renterSurname: row.renter_surname,
    renterCnp: row.renter_cnp,
    renterIdPhotoUrl: row.renter_id_photo_url ?? undefined,
    startDate: row.start_date,
    endDate: row.end_date,
    advancePayment: row.advance_payment ?? 0,
    status: row.status,
    notes: row.notes ?? undefined,
    kmStart: row.km_start ?? undefined,
    kmEnd: row.km_end ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
    segments,
    photos: [],
  }
}

function mapMaintenance(row: RemoteMaintenanceRow): Maintenance {
  return {
    id: row.id,
    carId: row.car_id,
    type: row.type === 'service' ? 'repair' : row.type,
    description: row.description,
    cost: row.cost,
    datePerformed: row.date_performed,
    expectedCompletionDate: row.expected_completion_date ?? undefined,
    kmAtService: row.km_at_service ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    documents: [],
  }
}

function mapMaintenanceDocument(row: RemoteMaintenanceDocumentRow): MaintenanceDocument {
  return {
    id: row.id,
    maintenanceId: row.maintenance_id,
    fileUrl: row.file_url,
    fileName: row.file_name ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

function mapInvite(
  row: RemoteFleetAccessRow,
  ownerProfile?: Pick<RemoteProfileRow, 'full_name'>,
): FleetAccess {
  return {
    id: row.id,
    ownerId: row.owner_id,
    invitedEmail: row.invited_email,
    role: row.role ?? 'viewer',
    acceptedAt: row.accepted_user_id ? row.accepted_at ?? undefined : undefined,
    acceptedUserId: row.accepted_user_id ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    ownerName: ownerProfile?.full_name ?? undefined,
  }
}

function mapNotification(row: RemoteNotificationRow): NotificationItem | null {
  if (!row.type) {
    return null
  }

  return {
    id: row.id,
    userId: row.user_id,
    carId: row.car_id ?? undefined,
    documentId: row.document_id ?? undefined,
    title: row.title,
    message: row.message,
    type: row.type,
    isRead: row.is_read ?? false,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

function groupByStringKey<T>(items: T[], getKey: (item: T) => string) {
  const groups = new Map<string, T[]>()

  items.forEach((item) => {
    const groupKey = getKey(item)
    const group = groups.get(groupKey)

    if (group) {
      group.push(item)
      return
    }

    groups.set(groupKey, [item])
  })

  return groups
}

async function loadRemoteDeferredAssets(): Promise<DeferredAssetsState> {
  const [carPhotosResult, maintenanceDocumentsResult] = await Promise.all([
    table('car_photos').select('*').order('created_at', { ascending: false }),
    table('maintenance_documents').select('*').order('created_at', { ascending: false }),
  ])

  if (carPhotosResult.error || maintenanceDocumentsResult.error) {
    throw new Error(carPhotosResult.error?.message || maintenanceDocumentsResult.error?.message || 'Nu am putut încărca fișierele auxiliare.')
  }

  const carPhotoRows = (carPhotosResult.data ?? []) as RemoteCarPhotoRow[]
  const maintenanceDocumentRows = (maintenanceDocumentsResult.data ?? []) as RemoteMaintenanceDocumentRow[]
  const [carPhotoUrlMap, maintenanceDocumentUrlMap] = await Promise.all([
    createSignedUrlMap('car-photos', carPhotoRows.map((row) => row.file_url)),
    createSignedUrlMap('maintenance-documents', maintenanceDocumentRows.map((row) => row.file_url)),
  ])

  return {
    carPhotos: carPhotoRows.map((row) => {
      const mapped = mapCarPhoto(row)
      return {
        ...mapped,
        fileUrl: carPhotoUrlMap.get(mapped.fileUrl) ?? mapped.fileUrl,
      }
    }),
    maintenanceDocuments: maintenanceDocumentRows.map((row) => {
      const mapped = mapMaintenanceDocument(row)
      return {
        ...mapped,
        fileUrl: maintenanceDocumentUrlMap.get(mapped.fileUrl) ?? mapped.fileUrl,
      }
    }),
  }
}

async function bootstrapRemote(user: AppUser): Promise<AppDataState> {
  const [profileResult, carsResult, documentsResult, rentalsResult, segmentsResult, maintenanceResult, invitesResult, notificationsResult] = await Promise.all([
    table('profiles').select('id, full_name, email, created_at').eq('id', user.id).maybeSingle(),
    table('cars').select('*').order('created_at', { ascending: false }),
    table('car_documents').select('*').order('created_at', { ascending: false }),
    table('rentals').select('*').order('created_at', { ascending: false }),
    table('rental_price_segments').select('*').order('created_at', { ascending: true }),
    table('maintenance').select('*').order('created_at', { ascending: false }),
    table('fleet_access').select('*').order('created_at', { ascending: false }),
    table('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
  ])

  if (
    profileResult.error ||
    carsResult.error ||
    documentsResult.error ||
    rentalsResult.error ||
    segmentsResult.error ||
    maintenanceResult.error ||
    invitesResult.error ||
    notificationsResult.error
  ) {
    throw new Error(
      profileResult.error?.message ||
        carsResult.error?.message ||
        documentsResult.error?.message ||
        rentalsResult.error?.message ||
        segmentsResult.error?.message ||
        maintenanceResult.error?.message ||
        invitesResult.error?.message ||
        notificationsResult.error?.message ||
        'Nu am putut încărca datele din Supabase.',
    )
  }

  const documentRows = (documentsResult.data ?? []) as RemoteDocumentRow[]
  const documentUrlMap = await createSignedUrlMap('car-documents', documentRows.map((row) => row.file_url))

  const profile = mapProfile((profileResult.data as RemoteProfileRow | null) ?? null, user)
  const cars = ((carsResult.data ?? []) as RemoteCarRow[]).map(mapCar)
  const documents = documentRows.map((row) => {
    const mapped = mapDocument(row)
    return {
      ...mapped,
      fileUrl: mapped.fileUrl ? (documentUrlMap.get(mapped.fileUrl) ?? mapped.fileUrl) : undefined,
    }
  })
  const segments = ((segmentsResult.data ?? []) as RemoteSegmentRow[]).map(mapSegment)
  const segmentsByRentalId = groupByStringKey(segments, (segment) => segment.rentalId)
  const rentals = ((rentalsResult.data ?? []) as RemoteRentalRow[]).map((row) => mapRental(row, segmentsByRentalId.get(row.id) ?? []))
  const maintenance = ((maintenanceResult.data ?? []) as RemoteMaintenanceRow[]).map((row) => ({
    ...mapMaintenance(row),
    documents: [],
  }))
  const ownerIds = Array.from(new Set(((invitesResult.data ?? []) as RemoteFleetAccessRow[]).map((invite) => invite.owner_id)))
  const ownerProfilesResult =
    ownerIds.length > 0
      ? await supabase.rpc(
          'get_invite_owner_profiles' as never,
          {
            owner_ids: ownerIds,
          } as never,
        )
      : { data: [], error: null }

  if (ownerProfilesResult.error) {
    throw new Error(ownerProfilesResult.error.message)
  }

  const ownerProfiles = new Map(
    (((ownerProfilesResult.data ?? []) as Array<Pick<RemoteProfileRow, 'id' | 'full_name'>>).map((profileRow) => [
      profileRow.id,
      profileRow,
    ]) as Array<[string, Pick<RemoteProfileRow, 'id' | 'full_name'>]>),
  )

  const fleetAccess = ((invitesResult.data ?? []) as RemoteFleetAccessRow[]).map((row) => mapInvite(row, ownerProfiles.get(row.owner_id)))
  const invites = fleetAccess.filter((invite) => invite.ownerId === user.id)
  const incomingInvites = fleetAccess.filter((invite) => normalizeEmail(invite.invitedEmail) === normalizeEmail(user.email))
  const persistedNotifications = ((notificationsResult.data ?? []) as RemoteNotificationRow[])
    .map(mapNotification)
    .filter((notification): notification is NotificationItem => Boolean(notification))
  const storedDocumentNotifications = persistedNotifications.filter((item) => item.documentId)
  const extraNotifications = persistedNotifications.filter((item) => !item.documentId)
  const notifications = [...extraNotifications, ...buildNotifications(documents, user.id, storedDocumentNotifications)]

  return {
    profile,
    cars,
    carPhotos: [],
    documents,
    rentals,
    maintenance,
    notifications,
    invites,
    incomingInvites,
  }
}

export const dataService = {
  resetDemoState(user: AppUser) {
    if (!isDemoUser(user)) {
      return
    }

    const previousState = readStoredDemoState(user.id)
    if (previousState) {
      revokeDemoStateFileUrls(previousState)
    }

    const state = createDemoState(user)
    localStorage.setItem(getStorageKey(user.id), JSON.stringify(state))
    localStorage.removeItem(getNotificationReadKey(user.id))
  },

  async bootstrap(user: AppUser) {
    if (isDemoUser(user)) {
      const state = readDemoState(user)
      const notifications = [
        ...state.notifications.filter((item) => !item.id.startsWith('doc-')),
        ...buildNotifications(
          state.documents,
          state.profile.id,
          state.notifications.filter((item) => Boolean(item.documentId)),
        ),
      ]
      const nextState = { ...state, notifications }
      writeDemoState(user.id, nextState)
      return nextState
    }

    return bootstrapRemote(user)
  },

  async loadDeferredAssets(user: AppUser): Promise<DeferredAssetsState> {
    if (isDemoUser(user)) {
      const state = readDemoState(user)
      return {
        carPhotos: state.carPhotos,
        maintenanceDocuments: state.maintenance.flatMap((item) => item.documents),
      }
    }

    return loadRemoteDeferredAssets()
  },

  async saveCar(
    user: AppUser,
    input: CarWriteInput,
  ) {
    const normalizedInput = normalizeCarInput(input)

    if (isDemoUser(user)) {
      const state = readDemoState(user)
      ensureDemoCarIdentifiersAvailable(state, normalizedInput)
      assertDemoCarStatusAllowed(state, normalizedInput)
      const now = new Date().toISOString()
      const current = normalizedInput.id ? state.cars.find((item) => item.id === normalizedInput.id) : undefined
      const normalizedDocuments = normalizeDocumentInputs(normalizedInput)
      const existingDocuments = state.documents.filter((item) => item.carId === normalizedInput.id)
      const existingDocumentsById = new Map(existingDocuments.map((document) => [document.id, document]))
      const car: Car = {
        ...normalizedInput,
        id: normalizedInput.id ?? crypto.randomUUID(),
        ownerId: normalizedInput.ownerId,
        engineKw: Math.round(normalizedInput.engineHp * 0.7457),
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      }

      const nextDocuments = normalizedDocuments.map((document) => {
        const nextDocumentId = document.id ?? crypto.randomUUID()
        const existingDocument = existingDocumentsById.get(nextDocumentId)

        return {
          id: nextDocumentId,
          carId: car.id,
          type: document.type,
          customName: document.type === 'OTHER' ? document.customName ?? 'Alt document' : getDocumentDefaultName(document.type),
          expiryDate: document.expiryDate ?? undefined,
          fileUrl: document.file ? createDemoFileUrl(document.file) : existingDocument?.fileUrl,
          isMandatory: document.type === 'ITP' || document.type === 'RCA',
          createdAt: existingDocument?.createdAt ?? now,
        } satisfies CarDocument
      })

      const removedDocumentUrls = existingDocuments
        .filter((document) => !nextDocuments.some((nextDocument) => nextDocument.id === document.id))
        .map((document) => document.fileUrl)
      const replacedDocumentUrls = nextDocuments
        .map((document) => existingDocumentsById.get(document.id))
        .filter(
          (document, index): document is CarDocument =>
            Boolean(document?.fileUrl && document.fileUrl !== nextDocuments[index]?.fileUrl),
        )
        .map((document) => document.fileUrl)
      const nextCarPhotos =
        normalizedInput.photoFiles?.map((file) => ({
          id: crypto.randomUUID(),
          carId: car.id,
          fileUrl: createDemoFileUrl(file),
          description: file.name,
          createdAt: now,
        } satisfies CarPhoto)) ?? []

      state.cars = current ? state.cars.map((item) => (item.id === normalizedInput.id ? car : item)) : [car, ...state.cars]
      state.documents = [...nextDocuments, ...state.documents.filter((item) => item.carId !== car.id)]
      state.carPhotos = nextCarPhotos.length > 0 ? [...nextCarPhotos, ...state.carPhotos] : state.carPhotos

      if (car.status === 'maintenance') {
        syncDemoLatestMaintenanceExpectedCompletionFromCar(state, car.id, car.serviceReturnDate)
      }

      revokeDemoBlobUrls([...removedDocumentUrls, ...replacedDocumentUrls])
      writeDemoState(user.id, state)
      return car
    }

    await ensureRemoteCarIdentifiersAvailable(normalizedInput)
    await assertRemoteCarStatusAllowed(normalizedInput)

    const previousCarResult = normalizedInput.id ? await table('cars').select('*').eq('id', normalizedInput.id).maybeSingle() : null
    if (previousCarResult?.error) {
      throw new Error(previousCarResult.error.message)
    }

    const previousCarRow = (previousCarResult?.data as RemoteCarRow | null) ?? null
    const query = normalizedInput.id
      ? table('cars').update(buildCarPayloadFromInput(normalizedInput)).eq('id', normalizedInput.id).select().single()
      : table('cars').insert({ id: normalizedInput.id ?? crypto.randomUUID(), ...buildCarPayloadFromInput(normalizedInput) }).select().single()

    const { data, error } = await query
    if (error) {
      throw new Error(error.message)
    }

    const savedCar = mapCar(data as RemoteCarRow)
    let documentSyncResult: SyncCarDocumentsResult | null = null
    let previousSyncedMaintenanceRow: RemoteMaintenanceRow | null = null

    try {
      documentSyncResult = await syncCarDocuments(savedCar, normalizedInput)

      if (normalizedInput.photoFiles?.length) {
        await addCarPhotos(savedCar, normalizedInput.photoFiles)
      }

      if (savedCar.status === 'maintenance') {
        previousSyncedMaintenanceRow = await syncRemoteLatestMaintenanceExpectedCompletionFromCar(savedCar.id, savedCar.serviceReturnDate)
      }

      if (documentSyncResult.obsoletePaths.length > 0) {
        void tryRemoveStorageFiles('car-documents', documentSyncResult.obsoletePaths)
      }

      return savedCar
    } catch (saveError) {
      if (normalizedInput.id) {
        if (previousCarRow) {
          await table('cars').update(buildCarPayloadFromRow(previousCarRow)).eq('id', previousCarRow.id)
        }

        if (previousSyncedMaintenanceRow) {
          await restoreMaintenanceRow(previousSyncedMaintenanceRow)
        }

        if (documentSyncResult) {
          await tryRemoveStorageFiles('car-documents', documentSyncResult.uploadedPaths)
          await restoreCarDocumentsSnapshot(savedCar.id, documentSyncResult.previousDocuments)
        }
      } else {
        await rollbackCreatedCar(savedCar.id)
      }

      throw saveError
    }
  },

  async deleteCar(user: AppUser, id: string) {
    if (isDemoUser(user)) {
      const state = readDemoState(user)
      const removedMaintenance = state.maintenance.filter((item) => item.carId === id)
      revokeDemoBlobUrls([
        ...state.carPhotos.filter((item) => item.carId === id).map((item) => item.fileUrl),
        ...state.documents.filter((item) => item.carId === id).map((item) => item.fileUrl),
        ...removedMaintenance.flatMap((item) => item.documents.map((document) => document.fileUrl)),
      ])
      state.cars = state.cars.filter((item) => item.id !== id)
      state.carPhotos = state.carPhotos.filter((item) => item.carId !== id)
      state.documents = state.documents.filter((item) => item.carId !== id)
      state.rentals = state.rentals.filter((item) => item.carId !== id)
      state.maintenance = state.maintenance.filter((item) => item.carId !== id)
      writeDemoState(user.id, state)
      return
    }

    const [documentsResult, carPhotosResult, maintenanceIdsResult] = await Promise.all([
      table('car_documents').select('file_url').eq('car_id', id),
      table('car_photos').select('file_url').eq('car_id', id),
      table('maintenance').select('id').eq('car_id', id),
    ])

    const maintenanceIds = ((maintenanceIdsResult.data ?? []) as Array<{ id: string }>).map((item) => item.id)
    const maintenanceDocumentsResult =
      maintenanceIds.length > 0
        ? await table('maintenance_documents').select('file_url').in('maintenance_id', maintenanceIds)
        : { data: [], error: null }

    await tryRemoveStorageFiles(
      'car-documents',
      ((documentsResult.data ?? []) as Array<{ file_url: string | null }>).map((document) => document.file_url),
    )
    await tryRemoveStorageFiles(
      'car-photos',
      ((carPhotosResult.data ?? []) as Array<{ file_url: string | null }>).map((photo) => photo.file_url),
    )
    await tryRemoveStorageFiles(
      'maintenance-documents',
      ((maintenanceDocumentsResult.data ?? []) as Array<{ file_url: string | null }>).map((document) => document.file_url),
    )

    const { error } = await table('cars').delete().eq('id', id)
    if (error) {
      throw new Error(error.message)
    }
  },

  async updateCarNotes(user: AppUser, id: string, notes: string) {
    const normalizedNotes = notes.trim()

    if (isDemoUser(user)) {
      const state = readDemoState(user)
      const current = state.cars.find((item) => item.id === id)

      if (!current) {
        throw new Error('Mașina selectată nu există.')
      }

      const updatedCar: Car = {
        ...current,
        notes: normalizedNotes || undefined,
        updatedAt: new Date().toISOString(),
      }

      state.cars = state.cars.map((item) => (item.id === id ? updatedCar : item))
      writeDemoState(user.id, state)
      return updatedCar
    }

    const { data, error } = await table('cars')
      .update({
        notes: normalizedNotes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return mapCar(data as RemoteCarRow)
  },

  async deleteCarDocument(user: AppUser, id: string) {
    if (isDemoUser(user)) {
      const state = readDemoState(user)
      const document = state.documents.find((item) => item.id === id)

      if (document?.fileUrl) {
        revokeDemoBlobUrls([document.fileUrl])
      }

      state.documents = state.documents.filter((item) => item.id !== id)
      writeDemoState(user.id, state)
      return
    }

    const documentResult = await table('car_documents').select('file_url').eq('id', id).maybeSingle()
    if (documentResult.error) {
      throw new Error(documentResult.error.message)
    }

    await tryRemoveStorageFiles('car-documents', [documentResult.data?.file_url as string | null | undefined])

    const { error } = await table('car_documents').delete().eq('id', id)
    if (error) {
      throw new Error(error.message)
    }
  },

  async deleteCarPhoto(user: AppUser, id: string) {
    if (isDemoUser(user)) {
      const state = readDemoState(user)
      const photo = state.carPhotos.find((item) => item.id === id)

      if (photo?.fileUrl) {
        revokeDemoBlobUrls([photo.fileUrl])
      }

      state.carPhotos = state.carPhotos.filter((item) => item.id !== id)
      writeDemoState(user.id, state)
      return
    }

    const photoResult = await table('car_photos').select('file_url').eq('id', id).maybeSingle()
    if (photoResult.error) {
      throw new Error(photoResult.error.message)
    }

    await tryRemoveStorageFiles('car-photos', [photoResult.data?.file_url as string | null | undefined])

    const { error } = await table('car_photos').delete().eq('id', id)
    if (error) {
      throw new Error(error.message)
    }
  },

  async saveRental(user: AppUser, input: Omit<Rental, 'id' | 'createdAt' | 'updatedAt' | 'photos'> & { id?: string }) {
    assertValidRentalInput(input)

    if (isDemoUser(user)) {
      const state = readDemoState(user)
      assertDemoRentalStatusAllowed(state, input)
      ensureDemoRentalAvailability(state, input)
      const now = new Date().toISOString()
      const current = input.id ? state.rentals.find((item) => item.id === input.id) : undefined
      const rental: Rental = {
        ...input,
        id: input.id ?? crypto.randomUUID(),
        photos: current?.photos ?? [],
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      }
      state.rentals = current ? state.rentals.map((item) => (item.id === input.id ? rental : item)) : [rental, ...state.rentals]
      refreshDemoCarStatuses(state, [current?.carId ?? '', input.carId].filter(Boolean))
      writeDemoState(user.id, state)
      return rental
    }

    await assertRemoteRentalStatusAllowed(input)
    await ensureRemoteRentalAvailability(input)

    let previousCarId: string | null = null
    if (input.id) {
      const previousRental = await table('rentals').select('car_id').eq('id', input.id).maybeSingle()
      if (previousRental.error) {
        throw new Error(previousRental.error.message)
      }
      previousCarId = (previousRental.data?.car_id as string | undefined) ?? null
    }

    const rentalPayload = {
      car_id: input.carId,
      renter_name: input.renterName,
      renter_surname: input.renterSurname,
      renter_cnp: input.renterCnp,
      renter_id_photo_url: input.renterIdPhotoUrl ?? null,
      start_date: input.startDate,
      end_date: input.endDate,
      advance_payment: input.advancePayment,
      status: input.status,
      notes: input.notes ?? null,
      km_start: input.kmStart ?? null,
      km_end: input.kmEnd ?? null,
      updated_at: new Date().toISOString(),
    }

    const rentalQuery = input.id
      ? table('rentals').update(rentalPayload).eq('id', input.id).select().single()
      : table('rentals').insert(rentalPayload).select().single()

    const { data, error } = await rentalQuery
    if (error) {
      throw new Error(error.message)
    }

    const rentalId = (data as RemoteRentalRow).id

    if (input.id) {
      const deleteSegments = await table('rental_price_segments').delete().eq('rental_id', rentalId)
      if (deleteSegments.error) {
        throw new Error(deleteSegments.error.message)
      }
    }

    if (input.segments.length > 0) {
      const { error: segmentsError } = await table('rental_price_segments').insert(
        input.segments.map((segment) => ({
          rental_id: rentalId,
          price_per_unit: segment.pricePerUnit,
          price_unit: segment.priceUnit,
          start_date: segment.startDate,
          end_date: segment.endDate,
        })),
      )
      if (segmentsError) {
        throw new Error(segmentsError.message)
      }
    }

    if (input.status === 'active') {
      const updateCar = await table('cars').update({ status: 'rented', updated_at: new Date().toISOString() }).eq('id', input.carId)
      if (updateCar.error) {
        throw new Error(updateCar.error.message)
      }
    } else {
      await refreshRemoteCarStatus(input.carId)
    }

    if (previousCarId && previousCarId !== input.carId) {
      await refreshRemoteCarStatus(previousCarId)
    }

    return mapRental(data as RemoteRentalRow, input.segments)
  },

  async deleteRental(user: AppUser, id: string) {
    if (isDemoUser(user)) {
      const state = readDemoState(user)
      const rental = state.rentals.find((item) => item.id === id)
      state.rentals = state.rentals.filter((item) => item.id !== id)
      if (rental) {
        const hasOtherActive = state.rentals.some((item) => item.carId === rental.carId && item.status === 'active')
        state.cars = state.cars.map((car) =>
          car.id === rental.carId && car.status === 'rented' && !hasOtherActive
            ? { ...car, status: 'available', updatedAt: new Date().toISOString() }
            : car,
        )
      }
      writeDemoState(user.id, state)
      return
    }

    const rentalResult = await table('rentals').select('car_id').eq('id', id).maybeSingle()
    if (rentalResult.error) {
      throw new Error(rentalResult.error.message)
    }

    const deleted = await table('rentals').delete().eq('id', id)
    if (deleted.error) {
      throw new Error(deleted.error.message)
    }

    if (rentalResult.data?.car_id) {
      await refreshRemoteCarStatus(rentalResult.data.car_id)
    }
  },

  async saveMaintenance(
    user: AppUser,
    input: Omit<Maintenance, 'id' | 'createdAt' | 'documents'> & {
      id?: string
      documentFiles?: File[]
      markCarAsMaintenance?: boolean
    },
  ) {
    if (isDemoUser(user)) {
      const state = readDemoState(user)
      assertDemoMaintenanceStatusAllowed(state, input)
      const current = input.id ? state.maintenance.find((item) => item.id === input.id) : undefined
      const previousCarId = current?.carId
      const now = new Date().toISOString()
      const maintenanceId = input.id ?? crypto.randomUUID()
      const nextDocuments = [
        ...(input.documentFiles?.map((file) => ({
          id: crypto.randomUUID(),
          maintenanceId,
          fileUrl: createDemoFileUrl(file),
          fileName: file.name,
          createdAt: now,
        } satisfies MaintenanceDocument)) ?? []),
        ...(current?.documents ?? []),
      ]
      const maintenance: Maintenance = {
        ...input,
        id: maintenanceId,
        createdAt: current?.createdAt ?? now,
        documents: nextDocuments,
      }
      state.maintenance = current
        ? state.maintenance.map((item) => (item.id === input.id ? maintenance : item))
        : [maintenance, ...state.maintenance]

      const affectedCarIds = Array.from(new Set([previousCarId, input.carId].filter((carId): carId is string => Boolean(carId))))

      for (const carId of affectedCarIds) {
        syncDemoCarServiceReturnDateFromLatestMaintenance(state, carId, {
          forceMaintenanceStatus: input.markCarAsMaintenance && carId === input.carId,
        })
      }

      writeDemoState(user.id, state)
      return maintenance
    }

    await assertRemoteMaintenanceStatusAllowed(input)

    const previousMaintenanceResult = input.id ? await table('maintenance').select('*').eq('id', input.id).maybeSingle() : null
    if (previousMaintenanceResult?.error) {
      throw new Error(previousMaintenanceResult.error.message)
    }

    const previousMaintenanceRow = (previousMaintenanceResult?.data as RemoteMaintenanceRow | null) ?? null
    const previousCarId = previousMaintenanceRow?.car_id ?? null
    const payload = {
      car_id: input.carId,
      type: input.type,
      description: input.description,
      cost: input.cost,
      date_performed: input.datePerformed,
      expected_completion_date: input.expectedCompletionDate ?? null,
      km_at_service: input.kmAtService ?? null,
      notes: input.notes ?? null,
    }

    const query = input.id
      ? table('maintenance').update(payload).eq('id', input.id).select().single()
      : table('maintenance').insert({ id: input.id ?? crypto.randomUUID(), ...payload }).select().single()

    const { data, error } = await query
    if (error) {
      throw new Error(error.message)
    }

    const maintenance = mapMaintenance(data as RemoteMaintenanceRow)
    let uploadResult: UploadBatchResult | null = null

    try {
      if (input.documentFiles?.length) {
        uploadResult = await addMaintenanceDocuments(user, maintenance.id, input.documentFiles)
      }

      const affectedCarIds = Array.from(new Set([previousCarId, input.carId].filter((carId): carId is string => Boolean(carId))))

      for (const carId of affectedCarIds) {
        await syncRemoteCarServiceReturnDateFromLatestMaintenance(carId, {
          forceMaintenanceStatus: input.markCarAsMaintenance && carId === input.carId,
        })
      }

      return maintenance
    } catch (saveError) {
      if (uploadResult) {
        await table('maintenance_documents').delete().in('id', uploadResult.insertedIds)
        await tryRemoveStorageFiles('maintenance-documents', uploadResult.uploadedPaths)
      }

      if (input.id) {
        if (previousMaintenanceRow) {
          await restoreMaintenanceRow(previousMaintenanceRow)
        }
      } else {
        await rollbackCreatedMaintenance(maintenance.id)
      }

      const affectedCarIds = Array.from(new Set([previousCarId, input.carId].filter((carId): carId is string => Boolean(carId))))

      for (const carId of affectedCarIds) {
        try {
          await syncRemoteCarServiceReturnDateFromLatestMaintenance(carId)
        } catch {
          // Best-effort sync after rollback.
        }
      }

      throw saveError
    }
  },

  async deleteMaintenance(user: AppUser, id: string) {
    if (isDemoUser(user)) {
      const state = readDemoState(user)
      const deletedMaintenance = state.maintenance.find((item) => item.id === id)
      revokeDemoBlobUrls(deletedMaintenance?.documents.map((document) => document.fileUrl) ?? [])
      state.maintenance = state.maintenance.filter((item) => item.id !== id)
      if (deletedMaintenance) {
        syncDemoCarServiceReturnDateFromLatestMaintenance(state, deletedMaintenance.carId)
      }
      writeDemoState(user.id, state)
      return
    }

    const maintenanceResult = await table('maintenance').select('car_id').eq('id', id).maybeSingle()
    if (maintenanceResult.error) {
      throw new Error(maintenanceResult.error.message)
    }

    const documentsResult = await table('maintenance_documents').select('file_url').eq('maintenance_id', id)
    await tryRemoveStorageFiles(
      'maintenance-documents',
      ((documentsResult.data ?? []) as Array<{ file_url: string | null }>).map((document) => document.file_url),
    )

    const { error } = await table('maintenance').delete().eq('id', id)
    if (error) {
      throw new Error(error.message)
    }

    const affectedCarId = maintenanceResult.data?.car_id
    if (affectedCarId) {
      await syncRemoteCarServiceReturnDateFromLatestMaintenance(affectedCarId)
    }
  },

  async markNotificationAsRead(user: AppUser, notification: NotificationItem) {
    const currentIds = new Set(readReadNotificationIds(user.id))
    currentIds.add(notification.id)
    if (notification.documentId) {
      currentIds.add(`doc-${notification.documentId}`)
    }
    writeReadNotificationIds(user.id, [...currentIds])

    if (isDemoUser(user)) {
      const state = readDemoState(user)
      state.notifications = state.notifications.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item))
      writeDemoState(user.id, state)
      return
    }

    try {
      if (notification.documentId) {
        const existingNotificationResult = await table('notifications')
          .select('id')
          .eq('user_id', user.id)
          .eq('document_id', notification.documentId)
          .eq('type', notification.type)
          .maybeSingle()

        if (existingNotificationResult.error) {
          throw new Error(existingNotificationResult.error.message)
        }

        if (existingNotificationResult.data?.id) {
          const updateResult = await table('notifications').update({ is_read: true }).eq('id', existingNotificationResult.data.id)

          if (updateResult.error) {
            throw new Error(updateResult.error.message)
          }
        } else {
          const insertResult = await table('notifications').insert({
            user_id: user.id,
            car_id: notification.carId ?? null,
            document_id: notification.documentId,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            is_read: true,
          })

          if (insertResult.error) {
            throw new Error(insertResult.error.message)
          }
        }

        return
      }

      if (!notification.id.startsWith('doc-')) {
        const updateResult = await table('notifications').update({ is_read: true }).eq('id', notification.id)

        if (updateResult.error) {
          throw new Error(updateResult.error.message)
        }
      }
    } catch {
      // Keep the local read state even if the remote sync is not available yet.
    }
  },

  async saveInvite(user: AppUser, input: Omit<FleetAccess, 'id' | 'createdAt' | 'ownerId' | 'acceptedAt'>) {
    if (isDemoUser(user)) {
      const state = readDemoState(user)
      const alreadyInvited = state.invites.some((invite) => normalizeEmail(invite.invitedEmail) === normalizeEmail(input.invitedEmail))
      if (alreadyInvited) {
        throw new Error('Acest utilizator are deja acces la flotă.')
      }
      state.invites = [
        {
          ...input,
          id: crypto.randomUUID(),
          ownerId: user.id,
          ownerName: user.fullName,
          ownerEmail: user.email,
          createdAt: new Date().toISOString(),
        },
        ...state.invites,
      ]
      writeDemoState(user.id, state)
      return
    }

    const duplicateInvite = await table('fleet_access')
      .select('id')
      .eq('owner_id', user.id)
      .eq('invited_email', normalizeEmail(input.invitedEmail))
      .maybeSingle()

    if (duplicateInvite.error) {
      throw new Error(duplicateInvite.error.message)
    }

    if (duplicateInvite.data?.id) {
      throw new Error('Acest utilizator are deja acces la flotă.')
    }

    const { error } = await table('fleet_access').insert({
      owner_id: user.id,
      invited_email: normalizeEmail(input.invitedEmail),
      role: input.role,
    })
    if (error) {
      throw new Error(error.message)
    }
  },

  async acceptInvite(user: AppUser, inviteId: string, ownerId: string) {
    if (isDemoUser(user)) {
      const state = readDemoState({ id: ownerId, email: '', fullName: '' })
      state.invites = state.invites.map((invite) =>
        invite.id === inviteId && normalizeEmail(invite.invitedEmail) === normalizeEmail(user.email)
          ? { ...invite, acceptedAt: new Date().toISOString(), acceptedUserId: user.id }
          : invite,
      )
      writeDemoState(ownerId, state)
      return
    }

    const { error } = await supabase.rpc(
      'accept_fleet_invite' as never,
      {
        target_invite_id: inviteId,
        target_owner_id: ownerId,
      } as never,
    )

    if (error) {
      throw new Error(error.message)
    }
  },

  async removeInvite(user: AppUser, inviteId: string, ownerId: string) {
    if (isDemoUser(user)) {
      const state = readDemoState({ id: ownerId, email: '', fullName: '' })
      state.invites = state.invites.filter((invite) => invite.id !== inviteId)
      writeDemoState(ownerId, state)
      return
    }

    const { error } = await supabase.rpc(
      'remove_fleet_access' as never,
      {
        target_invite_id: inviteId,
        target_owner_id: ownerId,
      } as never,
    )
    if (error) {
      throw new Error(error.message)
    }
  },

  async saveProfile(user: AppUser, profile: Profile) {
    if (isDemoUser(user)) {
      const state = readDemoState(user)
      state.profile = profile
      writeDemoState(user.id, state)
      return
    }

    const { error } = await table('profiles')
      .update({
        full_name: profile.fullName,
        email: user.email,
      })
      .eq('id', user.id)

    if (error) {
      throw new Error(error.message)
    }
  },
}

