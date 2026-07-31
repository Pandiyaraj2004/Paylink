import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Percent, AlertTriangle, ShieldAlert, Flag } from 'lucide-react';
import { AdminShell } from '@/components/AdminShell';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Skeleton } from '@/components/Skeleton';
import { Modal } from '@/components/Modal';
import { usePlatformSettings } from '@/hooks/useAdmin';
import { getApiError } from '@/api/client';

/**
 * Settings (master-doc.md Section 16.6) — deliberately minimal for an MVP.
 * A single `platformSettings/config` Firestore document with 4 real fields,
 * every one of them genuinely read somewhere in the backend (see
 * admin.service.js's module comment for each field's call site) — no
 * decorative toggles. `maintenanceMode` is the one with a merchant-facing
 * effect (a platform-wide checkout kill-switch in order.service.js), so
 * flipping it on prompts a secondary confirmation (Section 16.6: "a
 * secondary confirmation dialog for high-impact changes").
 *
 * PHASE 12 OVERLAP FLAG: a later "Phase 12 — Settings" pass (per its own
 * doc listing "Admin: Platform Settings, Fees, Feature Flags") should NOT
 * rebuild this page — Phase 11's own brief explicitly lists Settings among
 * its 6 pages. Extend the fields below instead of duplicating this screen.
 */
export default function AdminSettings() {
  const { data, isLoading, isError, refetch, update, isUpdating } = usePlatformSettings();

  const [platformFeePercent, setPlatformFeePercent] = useState('');
  const [refundRateAlertThreshold, setRefundRateAlertThreshold] = useState('');
  const [refundFlaggingEnabled, setRefundFlaggingEnabled] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [confirmMaintenance, setConfirmMaintenance] = useState(false);

  useEffect(() => {
    if (!data) return;
    setPlatformFeePercent(String(data.platformFeePercent));
    setRefundRateAlertThreshold(String(data.refundRateAlertThreshold * 100));
    setRefundFlaggingEnabled(data.refundFlaggingEnabled);
    setMaintenanceMode(data.maintenanceMode);
  }, [data]);

  const saveFees = async () => {
    const fee = Number(platformFeePercent);
    if (Number.isNaN(fee) || fee < 0 || fee > 100) {
      toast.error('Platform fee must be a number between 0 and 100.');
      return;
    }
    try {
      await update({ platformFeePercent: fee });
      toast.success('Platform fee updated.');
    } catch (err) {
      const { message } = getApiError(err);
      toast.error(message || 'Could not save. Please try again.');
    }
  };

  const saveRefundFlagging = async () => {
    const threshold = Number(refundRateAlertThreshold) / 100;
    if (Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
      toast.error('Refund-rate threshold must be a number between 0 and 100.');
      return;
    }
    try {
      await update({ refundRateAlertThreshold: threshold, refundFlaggingEnabled });
      toast.success('Refund flagging settings updated.');
    } catch (err) {
      const { message } = getApiError(err);
      toast.error(message || 'Could not save. Please try again.');
    }
  };

  const applyMaintenanceToggle = async (next: boolean) => {
    try {
      await update({ maintenanceMode: next });
      setMaintenanceMode(next);
      toast.success(next ? 'Maintenance mode enabled — checkout is now blocked platform-wide.' : 'Maintenance mode disabled.');
    } catch (err) {
      const { message } = getApiError(err);
      toast.error(message || 'Could not save. Please try again.');
    }
  };

  const handleMaintenanceToggle = (next: boolean) => {
    if (next) {
      setConfirmMaintenance(true); // high-impact change — secondary confirmation (Section 16.6)
    } else {
      applyMaintenanceToggle(false);
    }
  };

  if (isError) {
    return (
      <AdminShell>
        <h1 className="font-display text-h1 font-semibold text-text-primary">Settings</h1>
        <Card className="mt-6 flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-body-m text-text-secondary">Could not load platform settings right now.</p>
          <Button variant="ghost" onClick={() => refetch()}>
            Try again
          </Button>
        </Card>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <h1 className="font-display text-h1 font-semibold text-text-primary">Settings</h1>
      <p className="mt-1 text-body-m text-text-secondary">Platform-level configuration. Restricted to senior admins.</p>

      {isLoading ? (
        <div className="mt-6 flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-text-secondary" />
              <h2 className="text-h3 text-text-primary">Platform fee</h2>
            </div>
            <p className="text-body-m text-text-secondary">
              Used to estimate platform revenue on the Reports tab (Section 16.3) — changing this changes that figure immediately.
            </p>
            <div className="flex items-end gap-3">
              <Input label="Fee percent" type="number" min={0} max={100} step={0.1} value={platformFeePercent} onChange={(e) => setPlatformFeePercent(e.target.value)} />
              <Button onClick={saveFees} loading={isUpdating}>
                Save
              </Button>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-text-secondary" />
              <h2 className="text-h3 text-text-primary">Refund-rate flagging</h2>
            </div>
            <p className="text-body-m text-text-secondary">
              Controls the Refunds tab's (Section 16.4) automatic flagging of merchants whose refund rate is unusually high.
            </p>
            <label className="flex items-center gap-2 text-body-m text-text-primary">
              <input
                type="checkbox"
                checked={refundFlaggingEnabled}
                onChange={(e) => setRefundFlaggingEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-[var(--color-primary)]"
              />
              Enable flagging
            </label>
            <div className="flex items-end gap-3">
              <Input
                label="Alert threshold (%)"
                type="number"
                min={0}
                max={100}
                step={1}
                value={refundRateAlertThreshold}
                onChange={(e) => setRefundRateAlertThreshold(e.target.value)}
                disabled={!refundFlaggingEnabled}
              />
              <Button onClick={saveRefundFlagging} loading={isUpdating}>
                Save
              </Button>
            </div>
          </Card>

          <Card className={maintenanceMode ? 'border-danger/40 bg-danger/5' : ''}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-danger" />
                  <h2 className="text-h3 text-text-primary">Maintenance mode</h2>
                </div>
                <p className="text-body-m text-text-secondary">
                  A platform-wide kill-switch — when enabled, <strong>every</strong> merchant's checkout is blocked (order.service.js),
                  regardless of that merchant's own status. High-impact; requires confirmation.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={maintenanceMode}
                onClick={() => handleMaintenanceToggle(!maintenanceMode)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${maintenanceMode ? 'bg-danger' : 'bg-border'}`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${maintenanceMode ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>
          </Card>
        </div>
      )}

      <Modal open={confirmMaintenance} onOpenChange={setConfirmMaintenance} title="Enable maintenance mode?">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-danger">
            <AlertTriangle className="h-5 w-5" />
            <p className="text-body-m font-medium">This blocks checkout for every merchant on PayLink, immediately.</p>
          </div>
          <p className="text-body-m text-text-secondary">
            Use this only for platform-wide incidents — a single bad-actor merchant should be handled with Suspend (Merchant
            Management) instead.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmMaintenance(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={isUpdating}
              onClick={async () => {
                await applyMaintenanceToggle(true);
                setConfirmMaintenance(false);
              }}
            >
              Enable maintenance mode
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
