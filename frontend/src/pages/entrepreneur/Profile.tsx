import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { motion, useReducedMotion } from 'framer-motion';
import { ExternalLink, ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Skeleton } from '@/components/Skeleton';
import { Modal } from '@/components/Modal';
import { useMerchant, useGallery } from '@/hooks/useMerchant';
import type { BusinessHours, BusinessHoursDay, MerchantAddress, SocialLinks } from '@/api/merchants';
import { getApiError } from '@/api/client';

const MAX_BUSINESS_NAME_LEN = 80;
const MAX_TAGLINE_LEN = 140;
const MAX_DESCRIPTION_LEN = 2000;
const MAX_GALLERY_IMAGES = 20;

const EMPTY_ADDRESS: MerchantAddress = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
};

const DAYS: Array<{ key: keyof BusinessHours; label: string }> = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const EMPTY_DAY: NonNullable<BusinessHoursDay> = { open: '09:00', close: '17:00', closed: false };

// WhatsApp is deliberately NOT offered here — it lives only as the top-level
// Contact & Location card's `whatsapp` field below, so there's exactly one
// home for it instead of two (master-doc.md Section 14.14's resolution of an
// earlier inconsistency between top-level `whatsapp` and `socialLinks.whatsapp`).
const SOCIAL_FIELDS: Array<{ key: keyof SocialLinks; label: string; placeholder: string }> = [
  { key: 'website', label: 'Website', placeholder: 'https://your-store.com' },
  { key: 'instagram', label: 'Instagram', placeholder: '@your_store' },
  { key: 'facebook', label: 'Facebook', placeholder: 'facebook.com/your-store' },
];

const ADDRESS_FIELDS: Array<{ key: keyof MerchantAddress; label: string; placeholder: string; wide?: boolean }> = [
  { key: 'line1', label: 'Address line 1', placeholder: 'Street address', wide: true },
  { key: 'line2', label: 'Address line 2', placeholder: 'Apartment, suite, etc. (optional)', wide: true },
  { key: 'city', label: 'City', placeholder: 'City' },
  { key: 'state', label: 'State / Province', placeholder: 'State or province' },
  { key: 'postalCode', label: 'Postal code', placeholder: 'Postal code' },
  { key: 'country', label: 'Country', placeholder: 'Country' },
];

interface FormState {
  businessName: string;
  ownerName: string;
  tagline: string;
  description: string;
  category: string;
  photoBase64: string | null;
  logoBase64: string | null;
  coverBannerBase64: string | null;
  themePrimaryColor: string;
  themeSecondaryColor: string;
  businessHours: BusinessHours;
  socialLinks: SocialLinks;
  email: string;
  phone: string;
  whatsapp: string;
  address: MerchantAddress;
  googleMapsUrl: string;
}

async function compressToBase64(file: File, maxSizeMB: number, maxWidthOrHeight: number): Promise<string> {
  // Dynamically imported here only (master-doc.md Section 21.8: image-upload
  // surfaces only — Products/Profile pages), never a static top-level import.
  const imageCompression = (await import('browser-image-compression')).default;
  const compressed = await imageCompression(file, { maxSizeMB, maxWidthOrHeight, useWebWorker: true });
  return imageCompression.getDataUrlFromFile(compressed);
}

/**
 * Profile page (master-doc.md Section 14.14) — split out of the former
 * combined Settings page's "Profile & Business" tab so storefront/
 * business-identity editing has its own home, separate from account-level
 * Settings (Bank Details/Language/Notifications). Everything below was
 * moved here verbatim from the old ProfileBusinessTab.tsx (same fields, same
 * PATCH /api/merchants/:id call via useMerchant().updateMerchant) plus this
 * page's own addition: the gallery grid (Section 19.2's `gallery`
 * subcollection, POST/DELETE /api/merchants/:id/gallery).
 *
 * Also covers the About/Contact & Location fields Section 19.2 has always
 * documented on the merchant schema (description, owner name, email, phone,
 * whatsapp, address, Google Maps link) but that hadn't been wired up here
 * yet — no Maps API/billing involved, just a plain URL the merchant pastes.
 *
 * "Preview Storefront" links out to the real public store page (/pay/:slug)
 * rather than reusing a dedicated AI Website Preview component — Section
 * 14.2b's onboarding-only preview step doesn't exist as a page/component in
 * this codebase yet (there's nothing to reuse), so this is the pragmatic
 * substitute: the exact same live page a customer would see, just opened in
 * a new tab instead of embedded inline.
 */
export default function Profile() {
  const reduceMotion = useReducedMotion();
  const { merchant, isLoading, isError, refetch, updateMerchant, isUpdating } = useMerchant();
  const gallery = useGallery();

  const [form, setForm] = useState<FormState>({
    businessName: '',
    ownerName: '',
    tagline: '',
    description: '',
    category: '',
    photoBase64: null,
    logoBase64: null,
    coverBannerBase64: null,
    themePrimaryColor: '#6366f1',
    themeSecondaryColor: '#22c55e',
    businessHours: {},
    socialLinks: {},
    email: '',
    phone: '',
    whatsapp: '',
    address: EMPTY_ADDRESS,
    googleMapsUrl: '',
  });
  const [compressingField, setCompressingField] = useState<'photo' | 'logo' | 'cover' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [confirmDeleteImage, setConfirmDeleteImage] = useState<string | null>(null);

  useEffect(() => {
    if (!merchant) return;
    setForm({
      businessName: merchant.businessName ?? '',
      ownerName: merchant.ownerName ?? '',
      tagline: merchant.tagline ?? '',
      description: merchant.description ?? '',
      category: merchant.category ?? '',
      photoBase64: merchant.photoBase64 ?? null,
      logoBase64: merchant.logoBase64 ?? null,
      coverBannerBase64: merchant.coverBannerBase64 ?? null,
      themePrimaryColor: merchant.themePrimaryColor ?? '#6366f1',
      themeSecondaryColor: merchant.themeSecondaryColor ?? '#22c55e',
      businessHours: merchant.businessHours ?? {},
      socialLinks: merchant.socialLinks ?? {},
      email: merchant.email ?? '',
      phone: merchant.phone ?? '',
      whatsapp: merchant.whatsapp ?? '',
      address: { ...EMPTY_ADDRESS, ...(merchant.address ?? {}) },
      googleMapsUrl: merchant.googleMapsUrl ?? '',
    });
  }, [merchant]);

  const handleImageFile = async (
    field: 'photoBase64' | 'logoBase64' | 'coverBannerBase64',
    compressingKey: 'photo' | 'logo' | 'cover',
    file: File | undefined,
    maxSizeMB: number,
    maxWidthOrHeight: number
  ) => {
    if (!file) return;
    setCompressingField(compressingKey);
    try {
      const base64 = await compressToBase64(file, maxSizeMB, maxWidthOrHeight);
      setForm((prev) => ({ ...prev, [field]: base64 }));
    } catch (err) {
      console.error(err);
      toast.error('Could not process that image — try a different file.');
    } finally {
      setCompressingField(null);
    }
  };

  const setDay = (key: keyof BusinessHours, patch: Partial<NonNullable<BusinessHoursDay>>) => {
    setForm((prev) => ({
      ...prev,
      businessHours: {
        ...prev.businessHours,
        [key]: { ...EMPTY_DAY, ...(prev.businessHours[key] ?? undefined), ...patch },
      },
    }));
  };

  const toggleDayEnabled = (key: keyof BusinessHours, enabled: boolean) => {
    setForm((prev) => ({
      ...prev,
      businessHours: { ...prev.businessHours, [key]: enabled ? { ...EMPTY_DAY } : null },
    }));
  };

  const setSocialLink = (key: keyof SocialLinks, value: string) => {
    setForm((prev) => ({ ...prev, socialLinks: { ...prev.socialLinks, [key]: value || null } }));
  };

  const setAddressField = (key: keyof MerchantAddress, value: string) => {
    setForm((prev) => ({ ...prev, address: { ...prev.address, [key]: value } }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = form.businessName.trim();
    if (!trimmedName || trimmedName.length > MAX_BUSINESS_NAME_LEN) {
      setError(`Business name is required (max ${MAX_BUSINESS_NAME_LEN} characters).`);
      return;
    }
    if (form.tagline.length > MAX_TAGLINE_LEN) {
      setError(`Tagline must be up to ${MAX_TAGLINE_LEN} characters.`);
      return;
    }
    if (form.description.length > MAX_DESCRIPTION_LEN) {
      setError(`Description must be up to ${MAX_DESCRIPTION_LEN} characters.`);
      return;
    }

    try {
      await updateMerchant({
        businessName: trimmedName,
        ownerName: form.ownerName || undefined,
        tagline: form.tagline || undefined,
        description: form.description || undefined,
        category: form.category || undefined,
        photoBase64: form.photoBase64 ?? undefined,
        logoBase64: form.logoBase64 ?? undefined,
        coverBannerBase64: form.coverBannerBase64,
        themePrimaryColor: form.themePrimaryColor,
        themeSecondaryColor: form.themeSecondaryColor,
        businessHours: form.businessHours,
        socialLinks: form.socialLinks,
        email: form.email || undefined,
        phone: form.phone || undefined,
        whatsapp: form.whatsapp || undefined,
        address: form.address,
        googleMapsUrl: form.googleMapsUrl || undefined,
      });
      toast.success('Profile saved.');
    } catch (err) {
      const { message } = getApiError(err);
      setError(message || 'Could not save your changes. Please try again.');
    }
  };

  const handleGalleryFile = async (file: File | undefined) => {
    if (!file) return;
    if (gallery.images.length >= MAX_GALLERY_IMAGES) {
      toast.error(`You can add up to ${MAX_GALLERY_IMAGES} gallery photos.`);
      return;
    }
    setGalleryUploading(true);
    try {
      const base64 = await compressToBase64(file, 0.08, 800);
      await gallery.addImage({ imageBase64: base64, order: gallery.images.length });
      toast.success('Photo added to your gallery.');
    } catch (err) {
      console.error(err);
      toast.error('Could not add that photo — try a different file.');
    } finally {
      setGalleryUploading(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    try {
      await gallery.removeImage(imageId);
      toast.success('Photo removed from your gallery.');
    } catch {
      toast.error('Could not remove that photo. Please try again.');
    } finally {
      setConfirmDeleteImage(null);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (isError || !merchant) {
    return (
      <AppShell>
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-body-m text-text-secondary">Could not load your business profile right now.</p>
          <Button variant="ghost" onClick={() => refetch()}>
            Try again
          </Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            Storefront Identity
          </span>
          <h1 className="mt-2 font-display text-h1 font-semibold text-text-primary">Profile</h1>
          <p className="mt-1 text-body-m text-text-secondary">
            Edit how your storefront presents itself — changes go live on your public page immediately.
          </p>
        </div>
        {merchant.pageSlug && (
          <a href={`/pay/${merchant.pageSlug}`} target="_blank" rel="noreferrer">
            <Button variant="ghost">
              <ExternalLink className="h-4 w-4" /> Preview storefront
            </Button>
          </a>
        )}
      </div>

      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
        onSubmit={handleSubmit}
        className="mt-6 flex flex-col gap-6"
      >
        <Card>
          <h2 className="mb-4 text-body-l font-semibold text-text-primary">Business details</h2>
          <div className="flex flex-col gap-4">
            <Input
              label="Business name"
              value={form.businessName}
              onChange={(e) => setForm((p) => ({ ...p, businessName: e.target.value }))}
              maxLength={MAX_BUSINESS_NAME_LEN}
              required
            />
            <Input
              label="Category"
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              placeholder="e.g. home_bakery"
            />
            <Input
              label="Owner name"
              value={form.ownerName}
              onChange={(e) => setForm((p) => ({ ...p, ownerName: e.target.value }))}
              placeholder="The person running the business"
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-body-m font-medium text-text-primary">Tagline</label>
              <textarea
                value={form.tagline}
                onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))}
                maxLength={MAX_TAGLINE_LEN}
                rows={2}
                className="w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="A short line describing your store"
              />
              <p className="text-caption text-text-secondary">{form.tagline.length}/{MAX_TAGLINE_LEN}</p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-body-l font-semibold text-text-primary">About</h2>
          <div className="flex flex-col gap-1.5">
            <label className="text-body-m font-medium text-text-primary">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              maxLength={MAX_DESCRIPTION_LEN}
              rows={5}
              className="w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Tell customers about your business — shown on your storefront's About section."
            />
            <p className="text-caption text-text-secondary">{form.description.length}/{MAX_DESCRIPTION_LEN}</p>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-body-l font-semibold text-text-primary">Contact &amp; location</h2>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="hello@your-store.com"
              />
              <Input
                label="Phone"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+46 70 123 45 67"
              />
              <Input
                label="WhatsApp"
                value={form.whatsapp}
                onChange={(e) => setForm((p) => ({ ...p, whatsapp: e.target.value }))}
                placeholder="+46 70 123 45 67"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {ADDRESS_FIELDS.map(({ key, label, placeholder, wide }) => (
                <div key={key} className={wide ? 'sm:col-span-2' : undefined}>
                  <Input
                    label={label}
                    value={form.address[key] ?? ''}
                    onChange={(e) => setAddressField(key, e.target.value)}
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
            <Input
              label="Google Maps link"
              value={form.googleMapsUrl}
              onChange={(e) => setForm((p) => ({ ...p, googleMapsUrl: e.target.value }))}
              placeholder="Paste a Google Maps share link to your location"
            />
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-body-l font-semibold text-text-primary">Photos</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <ImageUploadField
              label="Profile photo"
              value={form.photoBase64}
              compressing={compressingField === 'photo'}
              onFile={(f) => handleImageFile('photoBase64', 'photo', f, 0.15, 600)}
              onClear={() => setForm((p) => ({ ...p, photoBase64: null }))}
            />
            <ImageUploadField
              label="Business logo"
              value={form.logoBase64}
              compressing={compressingField === 'logo'}
              onFile={(f) => handleImageFile('logoBase64', 'logo', f, 0.1, 400)}
              onClear={() => setForm((p) => ({ ...p, logoBase64: null }))}
            />
            <ImageUploadField
              label="Cover banner"
              value={form.coverBannerBase64}
              compressing={compressingField === 'cover'}
              onFile={(f) => handleImageFile('coverBannerBase64', 'cover', f, 0.15, 600)}
              onClear={() => setForm((p) => ({ ...p, coverBannerBase64: null }))}
              wide
            />
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-body-l font-semibold text-text-primary">Theme colors</h2>
          <div className="flex flex-wrap gap-8">
            <ColorField
              label="Primary color"
              value={form.themePrimaryColor}
              onChange={(v) => setForm((p) => ({ ...p, themePrimaryColor: v }))}
            />
            <ColorField
              label="Secondary color"
              value={form.themeSecondaryColor}
              onChange={(v) => setForm((p) => ({ ...p, themeSecondaryColor: v }))}
            />
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-body-l font-semibold text-text-primary">Business hours</h2>
          <div className="flex flex-col gap-2">
            {DAYS.map(({ key, label }) => {
              const day = form.businessHours[key] ?? null;
              const enabled = day != null;
              return (
                <div key={key} className="flex flex-wrap items-center gap-3 border-b border-border py-2 last:border-b-0">
                  <label className="flex w-32 shrink-0 items-center gap-2 text-body-m text-text-primary">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => toggleDayEnabled(key, e.target.checked)}
                      className="h-4 w-4 rounded-sm border-border"
                    />
                    {label}
                  </label>
                  {enabled ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={day?.open ?? ''}
                        onChange={(e) => setDay(key, { open: e.target.value })}
                        className="rounded-sm border border-border bg-surface px-2 py-1.5 text-body-m text-text-primary"
                      />
                      <span className="text-text-secondary">to</span>
                      <input
                        type="time"
                        value={day?.close ?? ''}
                        onChange={(e) => setDay(key, { close: e.target.value })}
                        className="rounded-sm border border-border bg-surface px-2 py-1.5 text-body-m text-text-primary"
                      />
                    </div>
                  ) : (
                    <span className="text-caption text-text-secondary">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-body-l font-semibold text-text-primary">Social links</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
              <Input
                key={key}
                label={label}
                value={form.socialLinks[key] ?? ''}
                onChange={(e) => setSocialLink(key, e.target.value)}
                placeholder={placeholder}
              />
            ))}
          </div>
        </Card>

        {error && (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" loading={isUpdating}>
            Save changes
          </Button>
        </div>
      </motion.form>

      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-body-l font-semibold text-text-primary">Gallery</h2>
            <p className="text-caption text-text-secondary">
              {gallery.images.length}/{MAX_GALLERY_IMAGES} photos — shown on your storefront's gallery section.
            </p>
          </div>
          <label
            className={cnUpload(galleryUploading || gallery.images.length >= MAX_GALLERY_IMAGES)}
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={galleryUploading || gallery.images.length >= MAX_GALLERY_IMAGES}
              onChange={(e) => handleGalleryFile(e.target.files?.[0])}
            />
            {galleryUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Add photo
          </label>
        </div>

        {gallery.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : gallery.images.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ImagePlus className="h-8 w-8 text-text-secondary" />
            <p className="text-body-m text-text-secondary">No gallery photos yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {gallery.images.map((img, i) => (
              <motion.div
                key={img.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18, delay: reduceMotion ? 0 : Math.min(i, 8) * 0.03 }}
                className="group relative aspect-square overflow-hidden rounded-md border border-border bg-bg"
              >
                <img src={img.imageBase64} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setConfirmDeleteImage(img.id)}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={!!confirmDeleteImage}
        onOpenChange={(open) => !open && setConfirmDeleteImage(null)}
        title="Remove photo?"
      >
        <p className="text-body-m text-text-secondary">This photo will be removed from your storefront gallery. This can't be undone.</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmDeleteImage(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={gallery.isRemoving}
            onClick={() => confirmDeleteImage && handleDeleteImage(confirmDeleteImage)}
          >
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}

function cnUpload(disabled: boolean) {
  return [
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-body-m font-medium text-text-primary hover:bg-bg',
    disabled ? 'pointer-events-none opacity-60' : '',
  ].join(' ');
}

function ImageUploadField({
  label,
  value,
  compressing,
  onFile,
  onClear,
  wide,
}: {
  label: string;
  value: string | null;
  compressing: boolean;
  onFile: (file: File | undefined) => void;
  onClear: () => void;
  wide?: boolean;
}) {
  return (
    <div>
      <label className="text-body-m font-medium text-text-primary">{label}</label>
      <div className="mt-1.5 flex items-center gap-3">
        <div
          className={
            wide
              ? 'flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-bg'
              : 'flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-bg'
          }
        >
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-5 w-5 text-text-secondary" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-body-m font-medium text-text-primary hover:bg-bg">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            {compressing && <Loader2 className="h-4 w-4 animate-spin" />}
            {value ? 'Change' : 'Upload'}
          </label>
          {value && (
            <button type="button" onClick={onClear} className="inline-flex items-center gap-1 text-caption text-text-secondary hover:text-danger">
              <X className="h-3 w-3" /> Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-body-m font-medium text-text-primary">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
        />
        <span className="text-body-m text-text-secondary">{value}</span>
      </div>
    </div>
  );
}
