import React, { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ImagePlus, Loader2, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Checkbox } from '@/components/Checkbox';
import { Modal } from '@/components/Modal';
import { Skeleton } from '@/components/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useMerchant, usePublicPage } from '@/hooks/useMerchant';
import {
  createProduct,
  deleteProduct,
  updateProduct,
  type Product,
  type ProductPayload,
} from '@/api/merchants';
import { cn } from '@/utils/cn';

const CURRENCIES = ['EUR', 'SEK', 'NOK'];
const MAX_NAME_LEN = 60;

interface ItemFormState {
  name: string;
  price: string;
  currency: string;
  isCustomAllowed: boolean;
  imageBase64: string | null;
}

const EMPTY_FORM = (defaultCurrency: string): ItemFormState => ({
  name: '',
  price: '',
  currency: defaultCurrency,
  isCustomAllowed: false,
  imageBase64: null,
});

/**
 * Catalog tab (master-doc.md Section 14.5) — item list with inline
 * edit/delete and an "Add Item" modal. Sources its item list from
 * `GET /api/merchants/:slug/public-page` (per Section 14.5's own API Calls
 * line — there's no separate "list my products" endpoint), and writes go
 * through the new POST/PATCH/DELETE product endpoints (Section 22.3),
 * invalidating that same query so this tab and Preview & Share stay in sync.
 */
export default function CatalogTab() {
  const reduceMotion = useReducedMotion();
  const { merchantId } = useAuth();
  const { merchant } = useMerchant();
  const slug = merchant?.pageSlug ?? null;
  const { data: page, isLoading, isError, refetch } = usePublicPage(slug);
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM('EUR'));
  const [compressing, setCompressing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  const items = page?.items ?? [];
  const defaultCurrency = items[0]?.currency ?? 'EUR';

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['public-page', slug] });

  const createMutation = useMutation({
    mutationFn: (item: ProductPayload) => createProduct(merchantId as string, item),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      toast.success('Item added to your catalog.');
    },
    onError: () => setSaveError('Could not save this item. Please try again.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ProductPayload> }) =>
      updateProduct(merchantId as string, id, patch),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      toast.success('Item updated.');
    },
    onError: () => setSaveError('Could not save your changes. Please try again.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProduct(merchantId as string, id),
    onSuccess: () => {
      invalidate();
      toast.success('Item removed.');
      setConfirmDelete(null);
    },
    onError: () => {
      toast.error('Could not remove this item. Please try again.');
      setConfirmDelete(null);
    },
  });

  const openAddModal = () => {
    setEditing(null);
    setForm(EMPTY_FORM(defaultCurrency));
    setSaveError(null);
    setModalOpen(true);
  };

  const openEditModal = (item: Product) => {
    setEditing(item);
    setForm({
      name: item.name,
      price: String(item.price),
      currency: item.currency,
      isCustomAllowed: item.isCustomAllowed,
      imageBase64: item.imageBase64 ?? null,
    });
    setSaveError(null);
    setModalOpen(true);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setCompressing(true);
    try {
      // Dynamically imported here only (master-doc.md Section 21.8: Settings
      // + Products pages only) — never a static top-level import.
      const imageCompression = (await import('browser-image-compression')).default;
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.12,
        maxWidthOrHeight: 600,
        useWebWorker: true,
      });
      const base64 = await imageCompression.getDataUrlFromFile(compressed);
      setForm((prev) => ({ ...prev, imageBase64: base64 }));
    } catch (err) {
      console.error(err);
      toast.error('Could not process that image — try a different file.');
    } finally {
      setCompressing(false);
    }
  };

  const requestDelete = (item: Product) => {
    if (items.length === 1) {
      toast.error(
        "You can't remove your only item — add another item first, or it'll leave your store with nothing to sell."
      );
      return;
    }
    setConfirmDelete(item);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    const trimmedName = form.name.trim();
    const priceNumber = Number(form.price);

    if (!trimmedName || trimmedName.length > MAX_NAME_LEN) {
      setSaveError(`Item name is required (max ${MAX_NAME_LEN} characters).`);
      return;
    }
    if (Number.isNaN(priceNumber) || priceNumber < 0) {
      setSaveError('Price must be a positive number.');
      return;
    }

    const payload: ProductPayload = {
      name: trimmedName,
      price: priceNumber,
      currency: form.currency,
      isCustomAllowed: form.isCustomAllowed,
      imageBase64: form.imageBase64,
    };

    if (editing) {
      updateMutation.mutate({ id: editing.id, patch: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-body-m text-text-secondary">Could not load your catalog right now.</p>
        <Button variant="ghost" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-body-m text-text-secondary">
          {items.length} item{items.length === 1 ? '' : 's'} in your catalog
        </p>
        <Button onClick={openAddModal}>
          <Plus className="h-4 w-4" /> Add item
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <p className="text-body-l font-medium text-text-primary">No items yet</p>
          <p className="max-w-sm text-body-m text-text-secondary">
            Let the AI Concierge draft your catalog from a quick description, or add your first item manually.
          </p>
          <div className="mt-2 flex gap-3">
            <Link to="/app/setup">
              <Button variant="ghost">
                <Sparkles className="h-4 w-4" /> Re-open AI Concierge
              </Button>
            </Link>
            <Button onClick={openAddModal}>
              <Plus className="h-4 w-4" /> Add item manually
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: reduceMotion ? 0 : i * 0.04 }}
              whileHover={reduceMotion ? undefined : { y: -2 }}
            >
              <Card className="flex items-center gap-4">
                {item.imageBase64 ? (
                  <img src={item.imageBase64} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-bg">
                    <ImagePlus className="h-5 w-5 text-text-secondary" aria-hidden />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-l font-medium text-text-primary">{item.name}</p>
                  <p className="text-caption text-text-secondary">
                    {item.currency} {item.price.toFixed(2)}
                    {item.isCustomAllowed && ' · Custom amount allowed'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => openEditModal(item)}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-bg hover:text-text-primary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => requestDelete(item)}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onOpenChange={setModalOpen} title={editing ? 'Edit item' : 'Add item'}>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            label="Item name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            maxLength={MAX_NAME_LEN}
            autoFocus
            required
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label="Price"
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                required
              />
            </div>
            <div className="w-28">
              <label className="text-body-m font-medium text-text-primary">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                className="mt-1.5 w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-body-m text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Checkbox
            id="isCustomAllowed"
            checked={form.isCustomAllowed}
            onCheckedChange={(v) => setForm((p) => ({ ...p, isCustomAllowed: v }))}
            label="Allow customers to enter a custom amount for this item"
          />

          <div>
            <label className="text-body-m font-medium text-text-primary">Photo (optional)</label>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-bg">
                {form.imageBase64 ? (
                  <img src={form.imageBase64} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-5 w-5 text-text-secondary" />
                )}
              </div>
              <label
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-body-m font-medium text-text-primary hover:bg-bg',
                  compressing && 'pointer-events-none opacity-60'
                )}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                {compressing && <Loader2 className="h-4 w-4 animate-spin" />}
                {form.imageBase64 ? 'Change photo' : 'Upload photo'}
              </label>
              {form.imageBase64 && (
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setForm((p) => ({ ...p, imageBase64: null }))}
                  className="text-text-secondary hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {saveError && (
            <p role="alert" className="text-caption text-danger">
              {saveError}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save changes' : 'Add item'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Remove item?"
      >
        <p className="text-body-m text-text-secondary">
          Remove <strong className="text-text-primary">{confirmDelete?.name}</strong> from your catalog? This
          can't be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
          >
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
}
