import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Users, Archive, RotateCcw, CloudLightning, Save, CheckCircle2, Trash2, ShoppingCart, ExternalLink, Loader2, Image, ShieldCheck, AlertTriangle, Layers, Edit3, History, X } from 'lucide-react';
import { getInitials, getDepartmentColor } from '../utils';

const WORKSPACE_COLOR_PRESETS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#0f172a'];

const AdminPanelView = ({
  users,
  setUsers,
  setIsNewUserModalOpen,
  setEditingUser,
  setIsUserEditModalOpen,
  token,
  API_URL,
  activeWorkspace,
  workspaces = [],
  onWorkspacesChanged
}) => {
  const [activeTab, setActiveTab] = useState('USERS'); // 'USERS' | 'ARCHIVE' | 'INTEGRATIONS' | 'PHOTOROOM_DEBUG'
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [debugImages, setDebugImages] = useState([]);

  // Multi-Workspace States
  const [adminWorkspaces, setAdminWorkspaces] = useState(workspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(() => activeWorkspace?.id || workspaces[0]?.id || '');
  const [isWsModalOpen, setIsWsModalOpen] = useState(false);
  const [wsForm, setWsForm] = useState({ id: '', name: '', badgeColor: '#4f46e5', isDefault: false });
  const [isSavingWs, setIsSavingWs] = useState(false);
  const [wsError, setWsError] = useState('');

  // Multi-Account BaseLinker States
  const [blAccounts, setBlAccounts] = useState([]);
  const [blEditingAccountId, setBlEditingAccountId] = useState('');
  const [blLabel, setBlLabel] = useState('BaseLinker Główny');
  const [blSetAsDefault, setBlSetAsDefault] = useState(true);
  const [baseLinkerToken, setBaseLinkerToken] = useState('');
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [verifyingBlId, setVerifyingBlId] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [tokenVerifyInfo, setTokenVerifyInfo] = useState(null);

  // Per-Workspace Allegro OAuth2 States
  const [allegroAuthData, setAllegroAuthData] = useState(null);
  const [allegroAccounts, setAllegroAccounts] = useState([]);
  const [allegroAccountLabel, setAllegroAccountLabel] = useState('');
  const [allegroSetAsDefault, setAllegroSetAsDefault] = useState(false);
  const [allegroCustomClientId, setAllegroCustomClientId] = useState('');
  const [allegroCustomClientSecret, setAllegroCustomClientSecret] = useState('');
  const [isAllegroPolling, setIsAllegroPolling] = useState(false);
  const [allegroSuccess, setAllegroSuccess] = useState('');
  const [allegroError, setAllegroError] = useState('');
  const pollInterval = React.useRef(null);

  // Per-Workspace Multi-Account InPost Von Halsky API States
  const [vhAccounts, setVhAccounts] = useState([]);
  const [vhEditingAccountId, setVhEditingAccountId] = useState('');
  const [vhCreateNew, setVhCreateNew] = useState(false);
  const [vhLabel, setVhLabel] = useState('InPost Von Halsky Główny');
  const [vhIsDefault, setVhIsDefault] = useState(true);
  const [vhConfig, setVhConfig] = useState(null);
  const [vhEnv, setVhEnv] = useState('production');
  const [vhClientId, setVhClientId] = useState('');
  const [vhClientSecret, setVhClientSecret] = useState('');
  const [vhOrgId, setVhOrgId] = useState('');
  const [vhOrgName, setVhOrgName] = useState('');
  const [vhApiBaseUrl, setVhApiBaseUrl] = useState('');
  const [vhTokenUrl, setVhTokenUrl] = useState('');
  const [vhDaysToShip, setVhDaysToShip] = useState('1');
  const [vhDescFormat, setVhDescFormat] = useState('html');
  const [vhMfrEmail, setVhMfrEmail] = useState('');
  const [vhMfrPhone, setVhMfrPhone] = useState('');
  const [vhReturnPolicy, setVhReturnPolicy] = useState('');
  const [vhComplaintPolicy, setVhComplaintPolicy] = useState('');
  const [isSavingVh, setIsSavingVh] = useState(false);
  const [isVerifyingVh, setIsVerifyingVh] = useState(false);
  const [vhMessage, setVhMessage] = useState('');
  const [vhError, setVhError] = useState('');
  const [vhVerifyInfo, setVhVerifyInfo] = useState(null);

  // Security Audit Logs
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);

  useEffect(() => {
    if (Array.isArray(workspaces) && workspaces.length > 0) {
      setAdminWorkspaces(workspaces);
      setSelectedWorkspaceId(prev => {
        if (prev && workspaces.some(w => w.id === prev)) return prev;
        return activeWorkspace?.id || workspaces[0]?.id || '';
      });
    }
  }, [workspaces, activeWorkspace?.id]);

  const selectedWs = adminWorkspaces.find(w => w.id === selectedWorkspaceId) || activeWorkspace || null;

  const getWsHeaders = React.useCallback((overrideWsId = null) => {
    const wsId = overrideWsId || selectedWorkspaceId;
    return {
      Authorization: `Bearer ${token}`,
      ...(wsId ? { 'X-Workspace-Id': wsId } : {})
    };
  }, [token, selectedWorkspaceId]);

  useEffect(() => {
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);

  const refreshWorkspacesList = React.useCallback(async (overrideList = null) => {
    if (Array.isArray(overrideList)) {
      setAdminWorkspaces(overrideList);
      if (onWorkspacesChanged) await onWorkspacesChanged(overrideList);
      return overrideList;
    }
    try {
      const list = onWorkspacesChanged
        ? await onWorkspacesChanged()
        : (await axios.get(`${API_URL}/api/workspaces`, { headers: { Authorization: `Bearer ${token}` } })).data?.workspaces;
      if (Array.isArray(list)) {
        setAdminWorkspaces(list);
        return list;
      }
    } catch (err) {
      console.error('[Workspaces] Błąd odświeżania listy klientów:', err);
    }
    return [];
  }, [API_URL, token, onWorkspacesChanged]);

  const loadBaseLinkerAccounts = React.useCallback(async (wsId = selectedWorkspaceId) => {
    if (!wsId) return;
    try {
      const res = await axios.get(`${API_URL}/api/workspaces/${encodeURIComponent(wsId)}/integrations?provider=BASELINKER`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Workspace-Id': wsId }
      });
      setBlAccounts(Array.isArray(res.data?.accounts) ? res.data.accounts : []);
    } catch (err) {
      console.error('[BaseLinkerAccounts] Błąd pobierania kont:', err);
    }
  }, [API_URL, token, selectedWorkspaceId]);

  const loadAllegroAccounts = React.useCallback(async (wsId = selectedWorkspaceId) => {
    if (!wsId) return;
    try {
      const res = await axios.get(`${API_URL}/api/allegro/auth/accounts`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Workspace-Id': wsId }
      });
      setAllegroAccounts(Array.isArray(res.data?.accounts) ? res.data.accounts : []);
    } catch (err) {
      console.error('[AllegroAccounts] Błąd pobierania kont:', err);
    }
  }, [API_URL, token, selectedWorkspaceId]);

  const applyVonHalskyConfigToForm = (cfg) => {
    setVhConfig(cfg || null);
    setVhEnv(cfg?.environment || 'production');
    setVhOrgId(cfg?.organizationId || '');
    setVhOrgName(cfg?.organizationName || '');
    setVhApiBaseUrl(cfg?.apiBaseUrl || '');
    setVhTokenUrl(cfg?.tokenUrl || '');
    setVhDaysToShip(String(cfg?.defaultDaysToShip ?? 1));
    setVhDescFormat(cfg?.defaultDescriptionFormat || 'html');
    setVhMfrEmail(cfg?.defaultManufacturerEmail || '');
    setVhMfrPhone(cfg?.defaultManufacturerPhone || '');
    setVhReturnPolicy(cfg?.defaultReturnPolicy || '');
    setVhComplaintPolicy(cfg?.defaultComplaintPolicy || '');
    if (cfg?.label) setVhLabel(cfg.label);
    if (typeof cfg?.isDefault === 'boolean') setVhIsDefault(cfg.isDefault);
  };

  const loadVonHalskyAccountsAndConfig = React.useCallback(async (wsId = selectedWorkspaceId, targetAccountId = null) => {
    if (!wsId) return;
    try {
      const headers = { Authorization: `Bearer ${token}`, 'X-Workspace-Id': wsId };
      const accRes = await axios.get(`${API_URL}/api/vonhalsky/accounts`, { headers });
      const list = Array.isArray(accRes.data?.accounts) ? accRes.data.accounts : [];
      setVhAccounts(list);

      const chosenId = targetAccountId || list.find(a => a.isDefault)?.id || list[0]?.id || '';
      setVhEditingAccountId(chosenId);
      setVhCreateNew(list.length === 0);

      const cfgUrl = chosenId
        ? `${API_URL}/api/vonhalsky/config?accountId=${encodeURIComponent(chosenId)}`
        : `${API_URL}/api/vonhalsky/config`;
      const res = await axios.get(cfgUrl, { headers });
      applyVonHalskyConfigToForm(res.data?.config || null);
      if (!chosenId) {
        setVhLabel('InPost Von Halsky Główny');
        setVhIsDefault(true);
      }
    } catch (err) {
      console.error('[VonHalskyConfig] Błąd odczytu konfiguracji:', err);
    }
  }, [API_URL, token, selectedWorkspaceId]);

  const loadAuditLogs = React.useCallback(async (wsId = selectedWorkspaceId) => {
    if (!wsId) return;
    setIsLoadingAuditLogs(true);
    try {
      const res = await axios.get(`${API_URL}/api/workspaces/${encodeURIComponent(wsId)}/audit-logs?limit=50`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Workspace-Id': wsId }
      });
      setAuditLogs(Array.isArray(res.data?.logs) ? res.data.logs : []);
    } catch (err) {
      console.error('[AuditLogs] Błąd odczytu dziennika zdarzeń:', err);
    } finally {
      setIsLoadingAuditLogs(false);
    }
  }, [API_URL, token, selectedWorkspaceId]);

  useEffect(() => {
    if (activeTab === 'ARCHIVE') {
       axios.get(`${API_URL}/api/tasks/archive/list`, { headers: { Authorization: `Bearer ${token}` } })
         .then(res => setArchivedTasks(res.data))
         .catch(err => console.error(err));
    } else if (activeTab === 'INTEGRATIONS') {
       refreshWorkspacesList();
    } else if (activeTab === 'PHOTOROOM_DEBUG') {
       axios.get(`${API_URL}/api/photoroom/debug/list`, { headers: { Authorization: `Bearer ${token}` } })
         .then(res => setDebugImages(res.data.files || []))
         .catch(err => console.error(err));
    }
  }, [activeTab, API_URL, token]);

  useEffect(() => {
    if (activeTab !== 'INTEGRATIONS' || !selectedWorkspaceId) return;
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
    setIsAllegroPolling(false);
    setAllegroAuthData(null);
    setAllegroError('');
    setAllegroSuccess('');
    setTokenError('');
    setTokenVerifyInfo(null);
    setBaseLinkerToken('');
    setBlEditingAccountId('');
    setBlLabel('BaseLinker Główny');
    setBlSetAsDefault(true);
    setVhError('');
    setVhMessage('');
    setVhVerifyInfo(null);
    setVhClientId('');
    setVhClientSecret('');

    loadBaseLinkerAccounts(selectedWorkspaceId);
    loadAllegroAccounts(selectedWorkspaceId);
    loadVonHalskyAccountsAndConfig(selectedWorkspaceId);
  }, [activeTab, selectedWorkspaceId, loadBaseLinkerAccounts, loadAllegroAccounts, loadVonHalskyAccountsAndConfig]);

  useEffect(() => {
    if (activeTab === 'INTEGRATIONS' && selectedWorkspaceId && showAuditLogs) {
      loadAuditLogs(selectedWorkspaceId);
    }
  }, [activeTab, selectedWorkspaceId, showAuditLogs, loadAuditLogs]);

  const handleOpenCreateWorkspace = () => {
    setWsError('');
    setWsForm({ id: '', name: '', badgeColor: '#0ea5e9', isDefault: false });
    setIsWsModalOpen(true);
  };

  const handleOpenEditWorkspace = () => {
    if (!selectedWs) return;
    setWsError('');
    setWsForm({
      id: selectedWs.id,
      name: selectedWs.name || '',
      badgeColor: selectedWs.badgeColor || '#4f46e5',
      isDefault: Boolean(selectedWs.isDefault)
    });
    setIsWsModalOpen(true);
  };

  const handleSaveWorkspace = async (e) => {
    e.preventDefault();
    if (!wsForm.name.trim()) {
      setWsError('Nazwa klienta jest wymagana.');
      return;
    }
    setWsError('');
    setIsSavingWs(true);
    try {
      let res;
      if (wsForm.id) {
        res = await axios.patch(
          `${API_URL}/api/workspaces/${encodeURIComponent(wsForm.id)}`,
          { name: wsForm.name.trim(), badgeColor: wsForm.badgeColor, isDefault: wsForm.isDefault },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        res = await axios.post(
          `${API_URL}/api/workspaces`,
          { name: wsForm.name.trim(), badgeColor: wsForm.badgeColor, isDefault: wsForm.isDefault },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      await refreshWorkspacesList(res.data?.workspaces);
      if (res.data?.workspace?.id) {
        setSelectedWorkspaceId(res.data.workspace.id);
      }
      setIsWsModalOpen(false);
    } catch (err) {
      setWsError(err.response?.data?.error || 'Nie udało się zapisać klienta.');
    } finally {
      setIsSavingWs(false);
    }
  };

  const handleArchiveWorkspace = async () => {
    if (!selectedWs || selectedWs.isDefault) return;
    if (!window.confirm(`Zarchiwizować klienta "${selectedWs.name}"? Dostęp do jego produktów i kluczy API zostanie wyłączony.`)) return;
    try {
      const res = await axios.delete(`${API_URL}/api/workspaces/${encodeURIComponent(selectedWs.id)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const updated = await refreshWorkspacesList(res.data?.workspaces);
      const fallback = updated.find(w => w.isDefault) || updated[0];
      if (fallback) setSelectedWorkspaceId(fallback.id);
    } catch (err) {
      alert(err.response?.data?.error || 'Nie udało się zarchiwizować klienta.');
    }
  };

  const startAllegroAuth = async (overrideLabel = null, overrideDefault = null) => {
    if (!selectedWorkspaceId) return;
    setAllegroError('');
    setAllegroSuccess('');
    if (pollInterval.current) clearInterval(pollInterval.current);
    try {
      const targetWsId = selectedWorkspaceId;
      const effectiveLabel = overrideLabel !== null ? overrideLabel : allegroAccountLabel;
      const effectiveDefault = overrideDefault !== null ? overrideDefault : allegroSetAsDefault;
      const body = {
        label: effectiveLabel || undefined,
        setAsDefault: Boolean(effectiveDefault)
      };
      if (allegroCustomClientId.trim()) body.customClientId = allegroCustomClientId.trim();
      if (allegroCustomClientSecret.trim()) body.customClientSecret = allegroCustomClientSecret.trim();

      const res = await axios.post(
        `${API_URL}/api/allegro/auth/start`,
        body,
        { headers: getWsHeaders(targetWsId) }
      );
      if (res.data.success) {
        setAllegroAuthData(res.data);
        setIsAllegroPolling(true);
        const activeFlowId = res.data.flowId;

        pollInterval.current = setInterval(async () => {
          try {
            const pollRes = await axios.post(
              `${API_URL}/api/allegro/auth/poll`,
              { flowId: activeFlowId },
              { headers: getWsHeaders(targetWsId) }
            );
            if (pollRes.data.success) {
              clearInterval(pollInterval.current);
              setIsAllegroPolling(false);
              setAllegroSuccess(pollRes.data.message || 'Sukces! Token konta Allegro został zapisany w skarbcu klienta.');
              setAllegroAuthData(null);
              setAllegroAccountLabel('');
              setAllegroSetAsDefault(false);
              setAllegroCustomClientId('');
              setAllegroCustomClientSecret('');
              if (Array.isArray(pollRes.data.accounts)) {
                setAllegroAccounts(pollRes.data.accounts);
              } else {
                loadAllegroAccounts(targetWsId);
              }
              refreshWorkspacesList();
            }
          } catch (pollErr) {
            if (pollErr.response && pollErr.response.status === 202) {
              // oczekiwanie na użytkownika
            } else {
              clearInterval(pollInterval.current);
              setIsAllegroPolling(false);
              setAllegroError(pollErr.response?.data?.error || 'Błąd autoryzacji tokena.');
            }
          }
        }, 5000);
      }
    } catch (err) {
      setAllegroError(err.response?.data?.error || 'Nie udało się nawiązać połączenia z API.');
    }
  };

  const handleSetDefaultAllegroAccount = async (accountId) => {
    setAllegroError('');
    try {
      const res = await axios.patch(
        `${API_URL}/api/allegro/auth/accounts/${encodeURIComponent(accountId)}/default`,
        {},
        { headers: getWsHeaders() }
      );
      if (Array.isArray(res.data?.accounts)) setAllegroAccounts(res.data.accounts);
      refreshWorkspacesList();
    } catch (err) {
      setAllegroError(err.response?.data?.error || 'Nie udało się zmienić domyślnego konta Allegro.');
    }
  };

  const handleRemoveAllegroAccount = async (accountId, label) => {
    if (!window.confirm(`Odłączyć konto Allegro "${label}" (#${accountId}) od klienta "${selectedWs?.name}"?`)) return;
    setAllegroError('');
    try {
      const res = await axios.delete(`${API_URL}/api/allegro/auth/accounts/${encodeURIComponent(accountId)}`, {
        headers: getWsHeaders()
      });
      if (Array.isArray(res.data?.accounts)) setAllegroAccounts(res.data.accounts);
      refreshWorkspacesList();
    } catch (err) {
      setAllegroError(err.response?.data?.error || 'Nie udało się usunąć konta Allegro.');
    }
  };

  const handleVerifyBlAccount = async (accountId) => {
     if (!selectedWorkspaceId || !accountId) return;
     setTokenError('');
     setTokenVerifyInfo(null);
     setVerifyingBlId(accountId);
     try {
        const res = await axios.post(
          `${API_URL}/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/integrations/${encodeURIComponent(accountId)}/verify`,
          {},
          { headers: getWsHeaders() }
        );
        setTokenVerifyInfo(res.data);
        loadBaseLinkerAccounts(selectedWorkspaceId);
     } catch (err) {
        setTokenError(err.response?.data?.errorMessage || err.response?.data?.error || 'Nie udało się zweryfikować tokena BaseLinker.');
     } finally {
        setVerifyingBlId('');
     }
  };

  const handleSetDefaultBlAccount = async (accountId) => {
     if (!selectedWorkspaceId || !accountId) return;
     setTokenError('');
     try {
        const res = await axios.patch(
          `${API_URL}/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/integrations/${encodeURIComponent(accountId)}`,
          { isDefault: true },
          { headers: getWsHeaders() }
        );
        if (Array.isArray(res.data?.accounts)) {
          setBlAccounts(res.data.accounts);
        } else {
          loadBaseLinkerAccounts(selectedWorkspaceId);
        }
        refreshWorkspacesList();
     } catch (err) {
        setTokenError(err.response?.data?.error || 'Nie udało się zmienić domyślnego konta BaseLinker.');
     }
  };

  const handleDeleteBlAccount = async (acc) => {
     if (!selectedWorkspaceId || !acc?.id) return;
     if (!window.confirm(`Usunąć konto BaseLinker "${acc.label}" z klienta "${selectedWs?.name}"?`)) return;
     setTokenError('');
     try {
        const res = await axios.delete(
          `${API_URL}/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/integrations/${encodeURIComponent(acc.id)}`,
          { headers: getWsHeaders() }
        );
        if (Array.isArray(res.data?.accounts)) {
          setBlAccounts(res.data.accounts);
        } else {
          loadBaseLinkerAccounts(selectedWorkspaceId);
        }
        if (blEditingAccountId === acc.id) {
          setBlEditingAccountId('');
          setBlLabel('BaseLinker Główny');
        }
        refreshWorkspacesList();
     } catch (err) {
        setTokenError(err.response?.data?.error || 'Nie udało się usunąć konta BaseLinker.');
     }
  };

  const handleSaveToken = async () => {
     if (!selectedWorkspaceId) return;
     setTokenError('');
     setTokenSaved(false);
     setTokenVerifyInfo(null);
     const trimmed = baseLinkerToken.trim();
     if (trimmed.length < 25) {
        setTokenError(`Token jest zbyt krótki (${trimmed.length} zn.). Wklej pełny, ważny token API z Base.com — skarbiec nie został zmieniony.`);
        return;
     }
     setIsSavingToken(true);
     try {
        const res = await axios.post(
          `${API_URL}/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/integrations/baselinker`,
          {
            ...(blEditingAccountId ? { accountId: blEditingAccountId } : {}),
            label: blLabel.trim() || 'BaseLinker Główny',
            token: trimmed,
            isDefault: Boolean(blSetAsDefault)
          },
          { headers: getWsHeaders() }
        );
        setBaseLinkerToken('');
        setBlEditingAccountId('');
        setBlLabel('BaseLinker Główny');
        if (Array.isArray(res.data?.accounts)) {
          setBlAccounts(res.data.accounts);
        } else {
          loadBaseLinkerAccounts(selectedWorkspaceId);
        }
        setTokenVerifyInfo({
          ok: true,
          source: 'vault',
          encrypted: true,
          inventories: res.data?.inventories || []
        });
        setTokenSaved(true);
        refreshWorkspacesList();
        setTimeout(() => setTokenSaved(false), 5000);
     } catch (err) {
        setTokenError(err.response?.data?.error || 'Błąd weryfikacji lub zapisu tokena BaseLinker.');
     } finally {
        setIsSavingToken(false);
     }
  };

  const handleSelectVhAccount = async (acc) => {
     if (!selectedWorkspaceId || !acc?.id) return;
     setVhError('');
     setVhMessage('');
     setVhVerifyInfo(null);
     setVhCreateNew(false);
     setVhEditingAccountId(acc.id);
     setVhClientId('');
     setVhClientSecret('');
     try {
        const res = await axios.get(
          `${API_URL}/api/vonhalsky/config?accountId=${encodeURIComponent(acc.id)}`,
          { headers: getWsHeaders() }
        );
        applyVonHalskyConfigToForm(res.data?.config || null);
     } catch (err) {
        setVhError(err.response?.data?.error || 'Nie udało się wczytać konta Von Halsky.');
     }
  };

  const handleStartNewVhAccount = () => {
     setVhError('');
     setVhMessage('');
     setVhVerifyInfo(null);
     setVhCreateNew(true);
     setVhEditingAccountId('');
     setVhLabel('');
     setVhIsDefault(vhAccounts.length === 0);
     setVhClientId('');
     setVhClientSecret('');
     setVhOrgId('');
     setVhOrgName('');
     setVhConfig(null);
  };

  const handleSetDefaultVhAccount = async (accId) => {
     if (!selectedWorkspaceId || !accId) return;
     setVhError('');
     try {
        await axios.patch(
          `${API_URL}/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/integrations/${encodeURIComponent(accId)}`,
          { isDefault: true },
          { headers: getWsHeaders() }
        );
        await loadVonHalskyAccountsAndConfig(selectedWorkspaceId, accId);
        refreshWorkspacesList();
     } catch (err) {
        setVhError(err.response?.data?.error || 'Nie udało się ustawić domyślnego konta Von Halsky.');
     }
  };

  const handleDeleteVhAccount = async (acc) => {
     if (!selectedWorkspaceId || !acc?.id) return;
     if (!window.confirm(`Usunąć konto InPost Von Halsky "${acc.label}" z klienta "${selectedWs?.name}"?`)) return;
     setVhError('');
     try {
        await axios.delete(`${API_URL}/api/vonhalsky/accounts/${encodeURIComponent(acc.id)}`, {
          headers: getWsHeaders()
        });
        await loadVonHalskyAccountsAndConfig(selectedWorkspaceId);
        refreshWorkspacesList();
     } catch (err) {
        setVhError(err.response?.data?.error || 'Nie udało się usunąć konta Von Halsky.');
     }
  };

  const handleSaveVonHalskyConfig = async () => {
     if (!selectedWorkspaceId) return;
     setVhError('');
     setVhMessage('');
     setIsSavingVh(true);
     try {
        const payload = {
           ...(vhCreateNew ? { createNew: true } : (vhEditingAccountId ? { accountId: vhEditingAccountId } : {})),
           label: vhLabel.trim() || 'InPost Von Halsky',
           isDefault: Boolean(vhIsDefault),
           environment: vhEnv,
           organizationId: vhOrgId.trim(),
           organizationName: vhOrgName.trim(),
           apiBaseUrl: vhApiBaseUrl.trim() || undefined,
           tokenUrl: vhTokenUrl.trim() || undefined,
           defaultDaysToShip: Number(vhDaysToShip) || 1,
           defaultDescriptionFormat: vhDescFormat,
           defaultManufacturerEmail: vhMfrEmail.trim(),
           defaultManufacturerPhone: vhMfrPhone.trim(),
           defaultReturnPolicy: vhReturnPolicy.trim(),
           defaultComplaintPolicy: vhComplaintPolicy.trim()
        };
        if (vhClientId.trim()) payload.clientId = vhClientId.trim();
        if (vhClientSecret.trim()) payload.clientSecret = vhClientSecret.trim();

        const res = await axios.post(`${API_URL}/api/vonhalsky/config`, payload, {
           headers: getWsHeaders()
        });
        setVhCreateNew(false);
        if (res.data?.config) {
           applyVonHalskyConfigToForm(res.data.config);
           if (res.data.config.accountId) setVhEditingAccountId(res.data.config.accountId);
        }
        setVhClientId('');
        setVhClientSecret('');
        setVhMessage(res.data?.message || 'Zapisano konfigurację InPost Von Halsky.');
        await loadVonHalskyAccountsAndConfig(selectedWorkspaceId, res.data?.config?.accountId || vhEditingAccountId);
        refreshWorkspacesList();
     } catch (err) {
        setVhError(err.response?.data?.error || 'Błąd zapisu konfiguracji InPost Von Halsky.');
     } finally {
        setIsSavingVh(false);
     }
  };

  const handleVerifyVonHalsky = async () => {
     if (!selectedWorkspaceId) return;
     setVhError('');
     setVhVerifyInfo(null);
     setIsVerifyingVh(true);
     try {
        const candidate = {};
        if (!vhCreateNew && vhEditingAccountId) candidate.accountId = vhEditingAccountId;
        if (vhClientId.trim()) candidate.clientId = vhClientId.trim();
        if (vhClientSecret.trim()) candidate.clientSecret = vhClientSecret.trim();
        if (vhEnv) candidate.environment = vhEnv;
        if (vhApiBaseUrl.trim()) candidate.apiBaseUrl = vhApiBaseUrl.trim();
        if (vhTokenUrl.trim()) candidate.tokenUrl = vhTokenUrl.trim();

        const res = await axios.post(`${API_URL}/api/vonhalsky/verify`, candidate, {
           headers: getWsHeaders()
        });
        setVhVerifyInfo(res.data);
        if (res.data?.ok && Array.isArray(res.data.organizations) && res.data.organizations.length === 1 && !vhOrgId.trim()) {
           setVhOrgId(res.data.organizations[0].id || '');
           setVhOrgName(res.data.organizations[0].name || '');
        }
     } catch (err) {
        setVhError(err.response?.data?.errorMessage || err.response?.data?.error || 'Błąd weryfikacji połączenia z InPost Von Halsky.');
     } finally {
        setIsVerifyingVh(false);
     }
  };

  const handleRestore = async (taskId) => {
     try {
        await axios.patch(`${API_URL}/api/tasks/${taskId}/restore`, {}, { headers: { Authorization: `Bearer ${token}` } });
        setArchivedTasks(archivedTasks.filter(t => t.id !== taskId));
     } catch (err) { console.error(err); }
  };

  const handleDeleteUser = async (userId, userName) => {
     if (window.confirm(`Czy na pewno chcesz usunąć pracownika: ${userName}?\nZostanie on zarchiwizowany (soft-delete).`)) {
         try {
             await axios.delete(`${API_URL}/api/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
             if (setUsers) {
                 setUsers(users.filter(u => u.id !== userId));
             }
         } catch (err) {
             alert(err.response?.data?.error || 'Błąd podczas usuwania pracownika');
         }
     }
  };

  return (
    <div className="flex-1 flex flex-col p-10 bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] min-h-0 overflow-hidden relative">
      <div className="bg-white border-b border-slate-200 shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between p-2 px-4 md:py-2.5 gap-3 mb-6 rounded-lg shadow-sm relative z-10">
        <div>
          <h2 className="text-sm font-bold text-slate-800 leading-tight">Panel Administracyjny</h2>
          <p className="text-[10px] font-medium text-slate-500">Nadzór nad uprawnieniami Nexus ERP</p>
        </div>
        <div className="flex space-x-4">
          <button onClick={() => setIsNewUserModalOpen(true)} className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-500 shadow-sm transition-all flex items-center">
             <Plus className="w-3.5 h-3.5 mr-1.5" /> Nowy Operator
          </button>
        </div>
      </div>
      
      <div className="flex space-x-2 mb-4 shrink-0 relative z-10">
         <button onClick={() => setActiveTab('USERS')} className={`px-4 py-2 rounded-md text-xs font-medium transition-all flex items-center shadow-sm ${activeTab === 'USERS' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            <Users className="w-3.5 h-3.5 mr-1.5" /> Baza Osobowościowa
         </button>
         <button onClick={() => setActiveTab('ARCHIVE')} className={`px-4 py-2 rounded-md text-xs font-medium transition-all flex items-center shadow-sm ${activeTab === 'ARCHIVE' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            <Archive className="w-3.5 h-3.5 mr-1.5" /> Archiwum Zadań
         </button>
         <button onClick={() => setActiveTab('INTEGRATIONS')} className={`px-4 py-2 rounded-md text-xs font-medium transition-all flex items-center shadow-sm ${activeTab === 'INTEGRATIONS' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            <CloudLightning className="w-3.5 h-3.5 mr-1.5" /> Integracje API
         </button>
         <button onClick={() => setActiveTab('PHOTOROOM_DEBUG')} className={`px-4 py-2 rounded-md text-xs font-medium transition-all flex items-center shadow-sm ${activeTab === 'PHOTOROOM_DEBUG' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            <Image className="w-3.5 h-3.5 mr-1.5" /> Debug Photoroom
         </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10">
        <div className="bg-white rounded-sm border border-slate-300 shadow-[0_15px_40px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col min-h-[30rem] w-full">
          <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-slate-900 rounded-sm flex items-center justify-center mr-5 shadow-xl shadow-slate-900/20">
                {activeTab === 'USERS' && <Users className="w-5 h-5 text-white"/>}
                {activeTab === 'ARCHIVE' && <Archive className="w-5 h-5 text-emerald-400" />}
                {activeTab === 'INTEGRATIONS' && <CloudLightning className="w-5 h-5 text-fuchsia-400" />}
                {activeTab === 'PHOTOROOM_DEBUG' && <Image className="w-5 h-5 text-indigo-400" />}
              </div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.25em]">
                {activeTab === 'USERS' && 'Kadra Pracownicza i Uprawnienia'}
                {activeTab === 'ARCHIVE' && 'Globalne Repozytorium Historycznych Zadań'}
                {activeTab === 'INTEGRATIONS' && 'Skarbiec Kluczy Autoryzacyjnych API'}
                {activeTab === 'PHOTOROOM_DEBUG' && 'Logi Graficzne z Silnika Photoroom'}
              </h3>
            </div>
          </div>
          
          <div className="flex-1 overflow-x-auto">
             {activeTab === 'USERS' ? (
                <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-slate-50/80 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-slate-300">
                <tr>
                  <th className="px-8 py-5">Operator</th>
                  <th className="px-8 py-5 text-center">Rola</th>
                  <th className="px-8 py-5 text-center">Grupa</th>
                  <th className="px-8 py-5 text-center">Departament</th>
                  <th className="px-8 py-5">Dostępne Moduły</th>
                  <th className="px-8 py-5 text-right">Zarządzanie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-all group">
                    <td className="px-8 py-6">
                      <div className="flex items-center text-left">
                        <div className={`w-10 h-10 rounded-sm ${getDepartmentColor(u.department)} flex items-center justify-center text-[10px] font-black mr-4`}>
                          {getInitials(u.name)}
                        </div>
                        <div>
                          <div className="text-xs font-black text-slate-900 uppercase tracking-tight leading-none mb-1 group-hover:text-indigo-600 transition-colors">{u.name}</div>
                          <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className={`px-4 py-1.5 rounded-sm text-[8px] font-black uppercase tracking-[0.2em] ${u.role === 'ADMIN' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-slate-100 text-slate-600'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{u.group || 'STANDARD'}</span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{u.department || 'BRAK'}</span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-wrap gap-1.5 max-w-sm">
                        {u.accessibleModules?.length > 0 
                          ? u.accessibleModules.map(m => <span key={m} className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[8px] font-black rounded uppercase">{m}</span>)
                          : <span className="text-rose-500 text-[8px] font-black uppercase">Brak widoków</span>
                        }
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex justify-end space-x-2">
                        <button onClick={() => { setEditingUser({...u, accessibleModules: u.accessibleModules || []}); setIsUserEditModalOpen(true); }} className="p-3 bg-white border border-slate-400 text-slate-600 rounded-sm hover:bg-slate-900 hover:text-white transition-all shadow-sm active:scale-95 group-hover:border-indigo-200">
                          <Settings className="w-4 h-4"/>
                        </button>
                        <button onClick={() => handleDeleteUser(u.id, u.name)} className="p-3 bg-white border border-slate-400 text-rose-500 rounded-sm hover:bg-rose-500 hover:text-white transition-all shadow-sm active:scale-95 group-hover:border-rose-200" title="Usuń konto">
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            ) : activeTab === 'ARCHIVE' ? (
                <table className="w-full text-left whitespace-nowrap">
                  <thead className="bg-slate-50/80 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-slate-300">
                    <tr>
                      <th className="px-8 py-5">Tytuł Zlecenia / Ticket</th>
                      <th className="px-8 py-5 text-center">Data Założenia</th>
                      <th className="px-8 py-5 text-center">Twórca</th>
                      <th className="px-8 py-5">Powiązania</th>
                      <th className="px-8 py-5 text-right flex justify-end">Opcje Operacyjne</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {archivedTasks.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition-all group">
                         <td className="px-8 py-6">
                            <div className="text-xs font-black text-slate-900 uppercase tracking-tight leading-none mb-1">{t.title}</div>
                            <div className="text-[9px] font-black text-slate-600 font-mono tracking-widest">{t.taskId}</div>
                         </td>
                         <td className="px-8 py-6 text-center text-[10px] font-bold text-slate-500">
                            {new Date(t.createdAt).toLocaleDateString()}
                         </td>
                         <td className="px-8 py-6 text-center text-[10px] font-black text-indigo-700 uppercase">
                            {t.creator?.name || 'DOMYŚLNY'}
                         </td>
                         <td className="px-8 py-6">
                            {(t.project || t.campaign) ? (
                              <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[8px] font-black rounded uppercase">
                                {t.project ? `PROJEKT: ${t.project.name}` : `KAMPANIA: ${t.campaign.name}`}
                              </span>
                            ) : <span className="text-[9px] font-black text-slate-300 uppercase">Zadanie Abstrakcyjne (Luźne)</span>}
                         </td>
                         <td className="px-8 py-6 text-right">
                           <div className="flex justify-end pr-2">
                             <button onClick={() => handleRestore(t.id)} className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-500 hover:text-white rounded-sm text-[9px] font-black uppercase tracking-widest shadow-sm transition-all flex items-center active:scale-95 group-hover:border-emerald-300">
                               <RotateCcw className="w-3 h-3 mr-2" /> Przywróć na Tablicę
                             </button>
                           </div>
                         </td>
                      </tr>
                    ))}
                    {archivedTasks.length === 0 && (
                      <tr><td colSpan="5" className="px-8 py-10 text-center"><div className="flex flex-col items-center"><Archive className="w-10 h-10 text-slate-200 mb-4" /><span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Brak zamkniętych zgłoszeń. System jest czysty.</span></div></td></tr>
                    )}
                  </tbody>
                </table>
            ) : activeTab === 'INTEGRATIONS' ? (
                <div className="p-8 md:p-10 space-y-8 bg-slate-50/40">
                   {/* Wybór i zarządzanie przestrzeniami klientów (Multi-Workspace) */}
                   <div className="max-w-4xl bg-white border border-slate-300 rounded-sm p-8 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                         <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-50 rounded-sm flex items-center justify-center border border-indigo-200">
                               <Layers className="w-6 h-6 text-indigo-600" />
                            </div>
                            <div>
                               <h4 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Przestrzenie Klientów (Multi-Workspace Vault)</h4>
                               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
                                 Każdy klient posiada izolowane klucze BaseLinker, Allegro, Von Halsky oraz katalog PIM/RMA
                               </p>
                            </div>
                         </div>
                         <div className="flex items-center gap-2">
                            <button
                               type="button"
                               onClick={handleOpenCreateWorkspace}
                               className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-sm text-[10px] font-black uppercase tracking-widest flex items-center shadow-sm"
                            >
                               <Plus className="w-3.5 h-3.5 mr-1.5" /> Nowy Klient
                            </button>
                            {selectedWs && (
                               <button
                                  type="button"
                                  onClick={handleOpenEditWorkspace}
                                  className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-sm text-[10px] font-black uppercase tracking-widest flex items-center"
                               >
                                  <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edytuj
                               </button>
                            )}
                            {selectedWs && !selectedWs.isDefault && (
                               <button
                                  type="button"
                                  onClick={handleArchiveWorkspace}
                                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-sm text-[10px] font-black uppercase tracking-widest flex items-center"
                               >
                                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Archiwizuj
                               </button>
                            )}
                         </div>
                      </div>

                      <div className="flex flex-wrap gap-2.5">
                         {adminWorkspaces.map(ws => {
                            const isSelected = ws.id === selectedWorkspaceId;
                            const s = ws.integrationsSummary || {};
                            return (
                               <button
                                  key={ws.id}
                                  type="button"
                                  onClick={() => setSelectedWorkspaceId(ws.id)}
                                  className={`px-4 py-2.5 rounded-sm border text-left transition-all flex items-center gap-3 ${
                                    isSelected
                                      ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                                      : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-300'
                                  }`}
                               >
                                  <span className="w-3 h-3 rounded-full shrink-0 border border-white/40" style={{ backgroundColor: ws.badgeColor || '#4f46e5' }} />
                                  <div>
                                     <div className="text-xs font-black flex items-center gap-1.5">
                                        {ws.name}
                                        {ws.isDefault && (
                                           <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'}`}>Domyślny</span>
                                        )}
                                     </div>
                                     <div className={`text-[9px] font-mono mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                                        PIM: {ws.productCount ?? 0} • BL:{s.baselinkerCount ?? 0} AL:{s.allegroCount ?? 0} VH:{s.vonhalskyCount ?? 0}
                                     </div>
                                  </div>
                               </button>
                            );
                         })}
                      </div>

                      {selectedWs && (
                         <div className="mt-4 px-4 py-2.5 rounded-sm border flex items-center justify-between text-xs font-bold"
                              style={{ borderColor: selectedWs.badgeColor || '#4f46e5', backgroundColor: `${selectedWs.badgeColor || '#4f46e5'}10` }}>
                            <span className="flex items-center gap-2 text-slate-800">
                               <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedWs.badgeColor || '#4f46e5' }} />
                               Konfigurujesz skarbiec API dla klienta: <strong className="uppercase">{selectedWs.name}</strong>
                               <span className="text-[10px] font-mono text-slate-500">({selectedWs.slug})</span>
                            </span>
                            <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                               Szyfrowanie AES-256-GCM + AAD
                            </span>
                         </div>
                      )}
                   </div>

                   {/* Karta BaseLinker (Multi-Account w wybranym kliencie) */}
                   <div className="max-w-4xl bg-white border border-slate-300 rounded-sm p-10 shadow-[0_15px_40px_rgba(0,0,0,0.03)] focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
                      <div className="flex items-center mb-6">
                         <div className="w-16 h-16 bg-blue-50 rounded-sm flex items-center justify-center mr-6 border border-blue-100">
                            <CloudLightning className="w-8 h-8 text-blue-600 drop-shadow-sm" />
                         </div>
                         <div>
                            <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Połączenia BaseLinker — {selectedWs?.name || 'Klient'}</h4>
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Izolowane Tokeny X-BLToken • Szyfrowanie AES-256-GCM</p>
                         </div>
                      </div>
                      
                      <div className="space-y-4">
                         <p className="text-xs text-slate-500 font-bold">
                            Przed zapisem backend testuje token w Base.com (`getInventories`), szyfruje go osobno dla klienta <strong>{selectedWs?.name}</strong> z podpisem AAD i nigdy nie zwraca jawnego sekretu do przeglądarki.
                         </p>

                         {blAccounts.length > 0 ? (
                            <div className="space-y-2 mb-4">
                               <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                  Konta BaseLinker klienta ({blAccounts.length})
                               </div>
                               {blAccounts.map(acc => (
                                  <div key={acc.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-sm">
                                     <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                           <span className="text-xs font-black text-slate-900">{acc.label}</span>
                                           <span className="text-[10px] font-mono bg-white border border-slate-300 px-1.5 py-0.5 rounded text-slate-600">{acc.maskedCredential || '••••'}</span>
                                           {acc.isDefault && (
                                              <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">Domyślne</span>
                                           )}
                                           {acc.configured && (
                                              <span className="text-[9px] font-black uppercase bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">AES-256-GCM OK</span>
                                           )}
                                        </div>
                                        <div className="text-[10px] text-slate-500 mt-1">
                                           {acc.lastVerifiedAt ? `Zweryfikowano: ${new Date(acc.lastVerifiedAt).toLocaleString('pl-PL')}` : 'Brak ostatniego testu'}
                                           {Array.isArray(acc.metadata?.inventories) && acc.metadata.inventories.length > 0
                                              ? ` • Katalogi: ${acc.metadata.inventories.map(i => `${i.name} [#${i.inventory_id}]`).join(', ')}`
                                              : ''}
                                        </div>
                                     </div>
                                     <div className="flex items-center gap-2">
                                        <button
                                           type="button"
                                           onClick={() => handleVerifyBlAccount(acc.id)}
                                           disabled={verifyingBlId === acc.id}
                                           className="px-2.5 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-sm text-[10px] font-black uppercase hover:bg-slate-100 disabled:opacity-50 flex items-center"
                                        >
                                           {verifyingBlId === acc.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                                           Testuj
                                        </button>
                                        {!acc.isDefault && (
                                           <button
                                              type="button"
                                              onClick={() => handleSetDefaultBlAccount(acc.id)}
                                              className="px-2.5 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-sm text-[10px] font-black uppercase hover:bg-slate-100"
                                           >
                                              Ustaw domyślne
                                           </button>
                                        )}
                                        <button
                                           type="button"
                                           onClick={() => {
                                              setBlEditingAccountId(acc.id);
                                              setBlLabel(acc.label || 'BaseLinker');
                                              setBlSetAsDefault(Boolean(acc.isDefault));
                                              setBaseLinkerToken('');
                                           }}
                                           className="px-2.5 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-sm text-[10px] font-black uppercase hover:bg-blue-100"
                                        >
                                           Podmień token
                                        </button>
                                        <button
                                           type="button"
                                           onClick={() => handleDeleteBlAccount(acc)}
                                           className="p-1.5 bg-white border border-rose-200 text-rose-600 rounded-sm hover:bg-rose-50"
                                           title="Usuń konto BaseLinker"
                                        >
                                           <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                     </div>
                                  </div>
                               ))}
                            </div>
                         ) : (
                            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-sm flex items-center gap-2">
                               <AlertTriangle className="w-4 h-4 shrink-0" />
                               Klient {selectedWs?.name} nie ma jeszcze skonfigurowanego tokena BaseLinker (fail-closed: nie odziedziczy klucza innego klienta).
                            </div>
                         )}

                         <div className="p-4 bg-slate-50 border border-slate-200 rounded-sm space-y-3">
                            {blEditingAccountId && (
                               <div className="flex items-center justify-between text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 px-3 py-2 rounded-sm">
                                  <span>Tryb aktualizacji klucza dla konta: <strong>{blLabel}</strong></span>
                                  <button
                                     type="button"
                                     onClick={() => {
                                        setBlEditingAccountId('');
                                        setBlLabel('BaseLinker Główny');
                                     }}
                                     className="text-[10px] uppercase font-black underline"
                                  >
                                     Dodaj jako nowe konto
                                  </button>
                               </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                               <input
                                  type="text"
                                  value={blLabel}
                                  onChange={e => setBlLabel(e.target.value)}
                                  placeholder="Nazwa własna konta BL (np. Konto Główne)"
                                  className="md:col-span-5 px-3 py-2.5 bg-white border border-slate-300 rounded-sm text-xs font-bold outline-none focus:border-blue-500"
                               />
                               <label className="md:col-span-7 flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
                                  <input
                                     type="checkbox"
                                     checked={blSetAsDefault}
                                     onChange={e => setBlSetAsDefault(e.target.checked)}
                                     className="rounded border-slate-300"
                                  />
                                  Ustaw jako domyślne konto BaseLinker dla klienta {selectedWs?.name}
                               </label>
                            </div>

                            <div className="flex flex-wrap gap-3">
                               <input
                                  id="bl_personal_api_token_once"
                                  name="bl_personal_api_token_once"
                                  type="password"
                                  autoComplete="new-password"
                                  data-lpignore="true"
                                  data-1p-ignore="true"
                                  data-form-type="other"
                                  placeholder="Wklej pełny token Base.com (pole celowo zawsze puste)"
                                  className="flex-1 min-w-[260px] px-5 py-3.5 bg-white border border-slate-400 rounded-sm text-sm font-mono text-slate-900 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                                  value={baseLinkerToken}
                                  onChange={(e) => setBaseLinkerToken(e.target.value)}
                               />
                               <button
                                  type="button"
                                  onClick={handleSaveToken}
                                  disabled={isSavingToken}
                                  className="px-7 py-3.5 bg-slate-900 text-white rounded-sm text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 shadow-lg transition-all active:scale-95 flex items-center disabled:opacity-50"
                               >
                                  {isSavingToken ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Weryfikacja...</> : tokenSaved ? <><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400"/> Zapisano i Zweryfikowano</> : <><Save className="w-4 h-4 mr-2"/> {blEditingAccountId ? 'Podmień i Zapisz' : 'Zweryfikuj i Dodaj'}</>}
                               </button>
                            </div>
                         </div>

                         {tokenError && (
                           <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-sm flex items-start gap-2">
                             <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                             <span>{tokenError}</span>
                           </div>
                         )}

                         {tokenVerifyInfo && (
                           <div className={`p-3.5 border text-xs font-bold rounded-sm ${tokenVerifyInfo.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                             {tokenVerifyInfo.ok ? (
                               <span>
                                 Połączenie z Base.com aktywne (AES-256-GCM). Wykryte katalogi ({tokenVerifyInfo.inventories?.length || 0}): {(tokenVerifyInfo.inventories || []).map(i => `${i.name} [#${i.inventory_id}]`).join(', ') || 'brak'}.
                               </span>
                             ) : (
                               <span>Test połączenia nieudany ({tokenVerifyInfo.errorCode}): {tokenVerifyInfo.errorMessage}</span>
                             )}
                           </div>
                         )}
                      </div>
                   </div>

                   {/* Karta Autoryzacji Allegro (Per-Workspace) */}
                   <div className="max-w-4xl bg-white border border-slate-300 rounded-sm p-10 shadow-[0_15px_40px_rgba(0,0,0,0.03)] focus-within:ring-4 focus-within:ring-orange-500/10 transition-all">
                      <div className="flex items-center mb-6">
                         <div className="w-16 h-16 bg-orange-50 rounded-sm flex items-center justify-center mr-6 border border-orange-100">
                            <ShoppingCart className="w-8 h-8 text-orange-500 drop-shadow-sm" />
                         </div>
                         <div>
                            <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Autoryzacja Allegro — {selectedWs?.name || 'Klient'}</h4>
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">OAuth2 Device Flow • Opcjonalne własne App Client ID / Secret klienta</p>
                         </div>
                      </div>
                      
                      <div className="space-y-4">
                         <p className="text-xs text-slate-500 font-bold mb-2">
                            Podłącz dowolną liczbę kont sprzedawców Allegro dla klienta <strong>{selectedWs?.name}</strong>. Konta są całkowicie odizolowane od pozostałych klientów w systemie.
                         </p>

                         {allegroAccounts.length > 0 && (
                           <div className="space-y-2 mb-4">
                             <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                               Podłączone konta sprzedawców ({allegroAccounts.length})
                             </div>
                             {allegroAccounts.map(acc => (
                               <div key={acc.accountId} className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-sm">
                                 <div>
                                   <div className="flex items-center gap-2 flex-wrap">
                                     <span className="text-xs font-black text-slate-900">{acc.label}</span>
                                     <span className="text-[10px] font-mono bg-white border border-slate-300 px-1.5 py-0.5 rounded text-slate-600">#{acc.accountId}</span>
                                     {acc.isDefault && (
                                       <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">Domyślne</span>
                                     )}
                                     <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${acc.hasWriteScope ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-800'}`}>
                                       {acc.hasWriteScope ? 'offers:write OK' : 'Brak offers:write'}
                                     </span>
                                     {acc.hasCustomApp && (
                                       <span className="text-[9px] font-black uppercase bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Własna App OAuth</span>
                                     )}
                                   </div>
                                   <div className="text-[10px] text-slate-500 mt-1">
                                     {acc.login ? `Login: ${acc.login} • ` : ''}
                                     {acc.tokenExpiresAt ? `Ważność access tokena: ${new Date(acc.tokenExpiresAt).toLocaleString('pl-PL')}` : ''}
                                   </div>
                                 </div>
                                 <div className="flex items-center gap-2">
                                   {!acc.isDefault && (
                                     <button
                                       type="button"
                                       onClick={() => handleSetDefaultAllegroAccount(acc.accountId)}
                                       className="px-2.5 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-sm text-[10px] font-black uppercase hover:bg-slate-100"
                                     >
                                       Ustaw domyślne
                                     </button>
                                   )}
                                   <button
                                     type="button"
                                     onClick={() => startAllegroAuth(acc.label, acc.isDefault)}
                                     disabled={isAllegroPolling}
                                     className="px-2.5 py-1.5 bg-orange-50 border border-orange-200 text-orange-700 rounded-sm text-[10px] font-black uppercase hover:bg-orange-100 disabled:opacity-50"
                                   >
                                     Odśwież sesję
                                   </button>
                                   <button
                                     type="button"
                                     onClick={() => handleRemoveAllegroAccount(acc.accountId, acc.label)}
                                     className="p-1.5 bg-white border border-rose-200 text-rose-600 rounded-sm hover:bg-rose-50"
                                     title="Odłącz konto"
                                   >
                                     <Trash2 className="w-3.5 h-3.5" />
                                   </button>
                                 </div>
                               </div>
                             ))}
                           </div>
                         )}

                         {!allegroAuthData && !isAllegroPolling && (
                           <div className="p-4 bg-slate-50 border border-slate-200 rounded-sm space-y-3">
                             <div className="flex flex-wrap gap-3 items-center">
                               <input
                                 type="text"
                                 value={allegroAccountLabel}
                                 onChange={e => setAllegroAccountLabel(e.target.value)}
                                 placeholder="Nazwa własna konta (np. Konto Główne, Sklep B2B)"
                                 className="flex-1 min-w-[240px] px-3 py-2 bg-white border border-slate-300 rounded-sm text-xs font-bold outline-none focus:border-orange-500"
                               />
                               <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
                                 <input
                                   type="checkbox"
                                   checked={allegroSetAsDefault}
                                   onChange={e => setAllegroSetAsDefault(e.target.checked)}
                                   className="rounded border-slate-300"
                                 />
                                 Ustaw jako domyślne
                               </label>
                             </div>

                             <details className="pt-1">
                               <summary className="text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                                 Opcjonalnie: użyj własnej aplikacji Allegro klienta (custom Client ID &amp; Secret)
                               </summary>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2.5">
                                 <input
                                   type="text"
                                   value={allegroCustomClientId}
                                   onChange={e => setAllegroCustomClientId(e.target.value)}
                                   placeholder="Własny ALLEGRO_CLIENT_ID (puste = domyślny z serwera)"
                                   className="px-3 py-2 bg-white border border-slate-300 rounded-sm text-xs font-mono"
                                 />
                                 <input
                                   type="password"
                                   autoComplete="new-password"
                                   value={allegroCustomClientSecret}
                                   onChange={e => setAllegroCustomClientSecret(e.target.value)}
                                   placeholder="Własny ALLEGRO_CLIENT_SECRET (szyfrowany AES-256-GCM)"
                                   className="px-3 py-2 bg-white border border-slate-300 rounded-sm text-xs font-mono"
                                 />
                               </div>
                             </details>

                             <button
                               type="button"
                               onClick={() => startAllegroAuth()}
                               className="px-8 py-3.5 bg-orange-500 text-white rounded-sm text-[10px] font-black uppercase tracking-[0.2em] hover:bg-orange-600 shadow-xl shadow-orange-500/20 transition-all active:scale-95 flex items-center"
                             >
                               <RotateCcw className="w-4 h-4 mr-2" /> {allegroAccounts.length > 0 ? 'Dodaj lub odśwież konto Allegro (Device Flow)' : 'Połącz konto Allegro (Device Flow)'}
                             </button>
                           </div>
                         )}

                         {allegroError && (
                           <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-sm mt-4">
                             {allegroError}
                           </div>
                         )}

                         {allegroSuccess && (
                           <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-sm mt-4 flex items-center">
                             <CheckCircle2 className="w-4 h-4 mr-2" /> {allegroSuccess}
                           </div>
                         )}

                         {allegroAuthData && isAllegroPolling && (
                           <div className="p-6 bg-slate-50 border border-slate-200 rounded-sm mt-4">
                             <p className="text-sm font-bold text-slate-800 mb-2">Wymagana Akcja Użytkownika</p>
                             <p className="text-xs text-slate-600 mb-4">{allegroAuthData.message}</p>
                             
                             <div className="flex items-center space-x-4 bg-white p-4 border border-slate-300 rounded-sm shadow-sm mb-4">
                                <a 
                                  href={allegroAuthData.verification_uri_complete} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex-1 text-sm font-mono text-indigo-600 hover:text-indigo-800 truncate"
                                >
                                  {allegroAuthData.verification_uri_complete}
                                </a>
                                <ExternalLink className="w-5 h-5 text-slate-400 shrink-0" />
                             </div>
                             
                             <div className="flex items-center text-xs font-bold text-indigo-600">
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Oczekuję na potwierdzenie w przeglądarce... (Polling)
                             </div>
                           </div>
                         )}
                      </div>
                   </div>

                   {/* Karta konfiguracji InPost Von Halsky API (Multi-Account w wybranym kliencie) */}
                   <div className="max-w-4xl bg-white border border-slate-300 rounded-sm p-10 shadow-[0_15px_40px_rgba(0,0,0,0.03)] focus-within:ring-4 focus-within:ring-yellow-500/10 transition-all">
                      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                         <div className="flex items-center">
                            <div className="w-16 h-16 bg-yellow-50 rounded-sm flex items-center justify-center mr-6 border border-yellow-200 font-black text-xl text-yellow-700">
                               VH
                            </div>
                            <div>
                               <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">InPost Von Halsky API — {selectedWs?.name || 'Klient'}</h4>
                               <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">OAuth 2.1 Client Credentials • OpenAPI v1.7.12</p>
                            </div>
                         </div>
                         <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded text-[10px] font-black uppercase ${vhConfig?.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                               {vhConfig?.configured ? `Połączono (${vhConfig.environment?.toUpperCase()})` : 'Oczekuje na Client ID / Secret'}
                            </span>
                            <button
                               type="button"
                               onClick={handleStartNewVhAccount}
                               className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-sm text-[10px] font-black uppercase tracking-wider flex items-center"
                            >
                               <Plus className="w-3 h-3 mr-1" /> Nowe konto VH
                            </button>
                         </div>
                      </div>

                      <div className="space-y-4">
                         <p className="text-xs text-slate-500 font-bold">
                            Sekret <span className="font-mono">client_secret</span> jest szyfrowany (AES-256-GCM + AAD) w skarbcu klienta <strong>{selectedWs?.name}</strong> i nigdy nie wraca do przeglądarki.
                         </p>

                         {vhAccounts.length > 0 && (
                            <div className="space-y-2">
                               <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                  Zapisane konta InPost Von Halsky ({vhAccounts.length})
                               </div>
                               {vhAccounts.map(acc => (
                                  <div
                                     key={acc.id}
                                     className={`flex flex-wrap items-center justify-between gap-3 p-3 border rounded-sm ${
                                        !vhCreateNew && vhEditingAccountId === acc.id
                                           ? 'bg-yellow-50/70 border-yellow-400'
                                           : 'bg-slate-50 border-slate-200'
                                     }`}
                                  >
                                     <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                           <span className="text-xs font-black text-slate-900">{acc.label}</span>
                                           <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">{String(acc.environment || 'production').toUpperCase()}</span>
                                           {acc.isDefault && <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">Domyślne</span>}
                                           <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${acc.configured ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-800'}`}>
                                              {acc.configured ? 'Klucze OK' : 'Brak sekretów'}
                                           </span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-mono mt-1">
                                           {acc.maskedCredential ? `ClientID: ${acc.maskedCredential} • ` : ''}
                                           {acc.externalAccountId ? `Org: ${acc.externalAccountId}` : 'Org: auto-detekcja'}
                                        </div>
                                     </div>
                                     <div className="flex items-center gap-2">
                                        <button
                                           type="button"
                                           onClick={() => handleSelectVhAccount(acc)}
                                           className="px-2.5 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-sm text-[10px] font-black uppercase hover:bg-slate-100"
                                        >
                                           Edytuj
                                        </button>
                                        {!acc.isDefault && (
                                           <button
                                              type="button"
                                              onClick={() => handleSetDefaultVhAccount(acc.id)}
                                              className="px-2.5 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-sm text-[10px] font-black uppercase hover:bg-slate-100"
                                           >
                                              Ustaw domyślne
                                           </button>
                                        )}
                                        <button
                                           type="button"
                                           onClick={() => handleDeleteVhAccount(acc)}
                                           className="p-1.5 bg-white border border-rose-200 text-rose-600 rounded-sm hover:bg-rose-50"
                                           title="Usuń konto Von Halsky"
                                        >
                                           <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                     </div>
                                  </div>
                               ))}
                            </div>
                         )}

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            <div>
                               <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Nazwa konta Von Halsky (etykieta)</label>
                               <input
                                  type="text"
                                  value={vhLabel}
                                  onChange={e => setVhLabel(e.target.value)}
                                  placeholder="np. Sklep Główny / Konto B2B"
                                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-xs font-bold"
                               />
                            </div>
                            <div className="flex items-end pb-2">
                               <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                                  <input
                                     type="checkbox"
                                     checked={vhIsDefault}
                                     onChange={e => setVhIsDefault(e.target.checked)}
                                     className="rounded border-slate-300"
                                  />
                                  Ustaw jako domyślne konto Von Halsky tego klienta
                               </label>
                            </div>
                            <div>
                               <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Środowisko API</label>
                               <select
                                  value={vhEnv}
                                  onChange={e => {
                                     const nextEnv = e.target.value;
                                     setVhEnv(nextEnv);
                                     const preset = vhConfig?.environmentPresets?.[nextEnv];
                                     if (preset) {
                                        setVhApiBaseUrl(preset.apiBaseUrl);
                                        setVhTokenUrl(preset.tokenUrl);
                                     }
                                  }}
                                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-xs font-bold"
                               >
                                  <option value="production">PRODUCTION (api.inpost-group.com/inpsa)</option>
                                  <option value="stage">STAGE / SANDBOX (stage-api.inpost-group.com/inpsa)</option>
                               </select>
                            </div>
                            <div>
                               <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Organization ID (UUID sklepu)</label>
                               <input
                                  type="text"
                                  value={vhOrgId}
                                  onChange={e => setVhOrgId(e.target.value)}
                                  placeholder="Wykryje się automatycznie po teście połączenia"
                                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-xs font-mono"
                               />
                            </div>
                            <div>
                               <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                                  Client ID {vhConfig?.clientIdMasked ? `(zapisany: ${vhConfig.clientIdMasked})` : ''}
                               </label>
                               <input
                                  type="text"
                                  value={vhClientId}
                                  onChange={e => setVhClientId(e.target.value)}
                                  placeholder={vhConfig?.hasClientId ? 'Pozostaw puste, aby zachować obecny' : 'Wklej Client ID z InPost API Portal'}
                                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-xs font-mono"
                               />
                            </div>
                            <div>
                               <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                                  Client Secret {vhConfig?.hasClientSecret ? '(zaszyfrowany AES-256-GCM)' : ''}
                               </label>
                               <input
                                  type="password"
                                  autoComplete="new-password"
                                  value={vhClientSecret}
                                  onChange={e => setVhClientSecret(e.target.value)}
                                  placeholder={vhConfig?.hasClientSecret ? 'Pozostaw puste, aby zachować obecny' : 'Wklej Client Secret'}
                                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-xs font-mono"
                               />
                            </div>
                            <div>
                               <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Domyślny czas wysyłki (dni, 0–60)</label>
                               <input
                                  type="number"
                                  min="0"
                                  max="60"
                                  value={vhDaysToShip}
                                  onChange={e => setVhDaysToShip(e.target.value)}
                                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs font-mono"
                               />
                            </div>
                            <div>
                               <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Domyślny format opisu oferty</label>
                               <select
                                  value={vhDescFormat}
                                  onChange={e => setVhDescFormat(e.target.value)}
                                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs font-bold"
                               >
                                  <option value="html">Bezpieczny HTML (zalecany)</option>
                                  <option value="plain">Czysty tekst strukturalny</option>
                               </select>
                            </div>
                            <div>
                               <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Domyślny e-mail GPSR producenta (fallback)</label>
                               <input
                                  type="email"
                                  value={vhMfrEmail}
                                  onChange={e => setVhMfrEmail(e.target.value)}
                                  placeholder="np. gpsr@twojadomena.pl"
                                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs"
                               />
                            </div>
                            <div>
                               <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Domyślny telefon GPSR (+48...)</label>
                               <input
                                  type="text"
                                  value={vhMfrPhone}
                                  onChange={e => setVhMfrPhone(e.target.value)}
                                  placeholder="+48123456789"
                                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs font-mono"
                               />
                            </div>
                         </div>

                         <details className="pt-1">
                            <summary className="text-[11px] font-bold text-slate-600 cursor-pointer">
                               Zaawansowane URL-e API / OAuth2 oraz domyślne polityki zwrotów i reklamacji
                            </summary>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                               <input
                                  type="text"
                                  value={vhApiBaseUrl}
                                  onChange={e => setVhApiBaseUrl(e.target.value)}
                                  placeholder="https://api.inpost-group.com/inpsa"
                                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs font-mono"
                               />
                               <input
                                  type="text"
                                  value={vhTokenUrl}
                                  onChange={e => setVhTokenUrl(e.target.value)}
                                  placeholder="https://api.inpost-group.com/oauth2/token"
                                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs font-mono"
                               />
                               <textarea
                                  rows={2}
                                  value={vhReturnPolicy}
                                  onChange={e => setVhReturnPolicy(e.target.value)}
                                  placeholder="Domyślna polityka zwrotów (postSale.returnPolicy.description)"
                                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs"
                               />
                               <textarea
                                  rows={2}
                                  value={vhComplaintPolicy}
                                  onChange={e => setVhComplaintPolicy(e.target.value)}
                                  placeholder="Domyślna polityka reklamacji (postSale.complaintPolicy.description)"
                                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs"
                               />
                            </div>
                         </details>

                         <div className="flex flex-wrap items-center gap-3 pt-2">
                            <button
                               type="button"
                               onClick={handleSaveVonHalskyConfig}
                               disabled={isSavingVh}
                               className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-sm text-[10px] font-black uppercase tracking-[0.18em] flex items-center disabled:opacity-50"
                            >
                               {isSavingVh ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                               {vhCreateNew ? 'Dodaj nowe konto Von Halsky' : 'Zapisz konto Von Halsky'}
                            </button>
                            <button
                               type="button"
                               onClick={handleVerifyVonHalsky}
                               disabled={isVerifyingVh}
                               className="px-5 py-3 bg-yellow-400 hover:bg-yellow-300 text-slate-950 rounded-sm text-[10px] font-black uppercase tracking-[0.18em] flex items-center disabled:opacity-50"
                            >
                               {isVerifyingVh ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                               Testuj połączenie i pobierz organizacje
                            </button>
                         </div>

                         {vhError && (
                            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-sm">
                               {vhError}
                            </div>
                         )}
                         {vhMessage && (
                            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-sm flex items-center">
                               <CheckCircle2 className="w-4 h-4 mr-2 shrink-0" /> {vhMessage}
                            </div>
                         )}
                         {vhVerifyInfo && (
                            <div className={`p-3.5 border text-xs font-bold rounded-sm space-y-2 ${vhVerifyInfo.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                               {vhVerifyInfo.ok ? (
                                  <>
                                     <div>
                                        Połączenie OAuth 2.1 aktywne ({String(vhVerifyInfo.environment || '').toUpperCase()}). Wykryte organizacje ({vhVerifyInfo.organizations?.length || 0}):
                                     </div>
                                     <div className="flex flex-wrap gap-2">
                                        {(vhVerifyInfo.organizations || []).map(org => (
                                           <button
                                              key={org.id}
                                              type="button"
                                              onClick={() => {
                                                 setVhOrgId(org.id);
                                                 setVhOrgName(org.name || '');
                                              }}
                                              className="px-2.5 py-1 bg-white border border-emerald-300 rounded text-[11px] text-emerald-900 hover:bg-emerald-100"
                                           >
                                              {org.name} ({org.id})
                                           </button>
                                        ))}
                                     </div>
                                  </>
                               ) : (
                                  <div>Test nieudany ({vhVerifyInfo.errorCode}): {vhVerifyInfo.errorMessage}</div>
                               )}
                            </div>
                         )}
                      </div>
                   </div>

                   {/* Dziennik Zdarzeń Bezpieczeństwa (Audit Log) */}
                   <div className="max-w-4xl bg-white border border-slate-300 rounded-sm p-6 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                         <div className="flex items-center gap-3">
                            <History className="w-5 h-5 text-slate-600" />
                            <div>
                               <h5 className="text-xs font-black uppercase tracking-widest text-slate-800">
                                  Dziennik Zdarzeń Bezpieczeństwa — {selectedWs?.name || 'Klient'}
                               </h5>
                               <p className="text-[10px] text-slate-500 font-bold">
                                  Audyt zapisu/usunięcia tokenów, testów połączeń i ręcznych eksportów
                               </p>
                            </div>
                         </div>
                         <button
                            type="button"
                            onClick={() => {
                               const next = !showAuditLogs;
                               setShowAuditLogs(next);
                               if (next && selectedWorkspaceId) loadAuditLogs(selectedWorkspaceId);
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-sm text-[10px] font-black uppercase tracking-wider"
                         >
                            {showAuditLogs ? 'Ukryj dziennik' : 'Pokaż dziennik'}
                         </button>
                      </div>

                      {showAuditLogs && (
                         <div className="mt-4 border-t border-slate-200 pt-3">
                            {isLoadingAuditLogs ? (
                               <div className="py-4 text-xs text-slate-500 flex items-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie logów bezpieczeństwa...
                               </div>
                            ) : auditLogs.length === 0 ? (
                               <div className="py-4 text-xs text-slate-500 font-bold">Brak zarejestrowanych zdarzeń dla tego klienta.</div>
                            ) : (
                               <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-[11px]">
                                  {auditLogs.map(log => (
                                     <div key={log.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                           <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${log.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                              {log.status}
                                           </span>
                                           <span className="font-mono font-bold text-slate-800">{log.action}</span>
                                           {log.provider && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{log.provider}</span>}
                                           {(log.integrationAccountId || log.entityId) && (
                                              <span className="text-slate-400 font-mono">
                                                 [{[log.integrationAccountId, log.entityId].filter(Boolean).join(':')}]
                                              </span>
                                           )}
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-mono">
                                           {new Date(log.createdAt).toLocaleString('pl-PL')}
                                        </span>
                                     </div>
                                  ))}
                               </div>
                            )}
                         </div>
                      )}
                   </div>

                   {/* Modal Tworzenia / Edycji Przestrzeni Klienta */}
                   {isWsModalOpen && (
                      <div className="fixed inset-0 z-[220] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
                         <form onSubmit={handleSaveWorkspace} className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden">
                            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                               <h4 className="text-xs font-black uppercase tracking-widest">
                                  {wsForm.id ? 'Edycja Przestrzeni Klienta' : 'Nowa Przestrzeń Klienta'}
                               </h4>
                               <button type="button" onClick={() => setIsWsModalOpen(false)} className="text-slate-400 hover:text-white">
                                  <X className="w-4 h-4" />
                               </button>
                            </div>
                            <div className="p-6 space-y-4">
                               <div>
                                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Nazwa Klienta *</label>
                                  <input
                                     type="text"
                                     value={wsForm.name}
                                     onChange={e => setWsForm(prev => ({ ...prev, name: e.target.value }))}
                                     placeholder="np. Klient B — BioPharma Sp. z o.o."
                                     className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs font-bold outline-none focus:border-indigo-500"
                                     autoFocus
                                  />
                               </div>
                               <div>
                                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1.5">Kolor etykiety ostrzegawczej</label>
                                  <div className="flex items-center gap-2 flex-wrap">
                                     {WORKSPACE_COLOR_PRESETS.map(col => (
                                        <button
                                           key={col}
                                           type="button"
                                           onClick={() => setWsForm(prev => ({ ...prev, badgeColor: col }))}
                                           className={`w-7 h-7 rounded-full border-2 transition-transform ${wsForm.badgeColor === col ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                                           style={{ backgroundColor: col }}
                                           title={col}
                                        />
                                     ))}
                                     <input
                                        type="color"
                                        value={wsForm.badgeColor}
                                        onChange={e => setWsForm(prev => ({ ...prev, badgeColor: e.target.value }))}
                                        className="w-8 h-8 rounded cursor-pointer border border-slate-300"
                                     />
                                  </div>
                               </div>
                               <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                                  <input
                                     type="checkbox"
                                     checked={Boolean(wsForm.isDefault)}
                                     onChange={e => setWsForm(prev => ({ ...prev, isDefault: e.target.checked }))}
                                     className="rounded border-slate-300"
                                  />
                                  Ustaw jako domyślną przestrzeń po zalogowaniu
                               </label>
                               {wsError && (
                                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-sm">
                                     {wsError}
                                  </div>
                               )}
                            </div>
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                               <button
                                  type="button"
                                  onClick={() => setIsWsModalOpen(false)}
                                  className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-sm text-[10px] font-black uppercase"
                               >
                                  Anuluj
                               </button>
                               <button
                                  type="submit"
                                  disabled={isSavingWs}
                                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-sm text-[10px] font-black uppercase flex items-center disabled:opacity-50"
                               >
                                  {isSavingWs ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                                  {wsForm.id ? 'Zapisz zmiany' : 'Utwórz klienta'}
                               </button>
                            </div>
                         </form>
                      </div>
                   )}
                </div>
            ) : activeTab === 'PHOTOROOM_DEBUG' ? (
                <div className="p-8">
                   <div className="flex justify-between items-center mb-6">
                      <p className="text-xs font-bold text-slate-500">Podgląd na żywo plików zapisanych przez Agenta 11 na dysku w trakcie generowania Photoroom.</p>
                      <button onClick={() => {
                         axios.get(`${API_URL}/api/photoroom/debug/list`, { headers: { Authorization: `Bearer ${token}` } })
                           .then(res => setDebugImages(res.data.files || []))
                           .catch(err => console.error(err));
                      }} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all shadow-sm">
                         Odśwież
                      </button>
                   </div>
                   {debugImages.length === 0 ? (
                      <div className="py-20 text-center"><div className="flex flex-col items-center"><Image className="w-10 h-10 text-slate-200 mb-4" /><span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Brak obrazów w folderze debug_images.</span></div></div>
                   ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                         {debugImages.map(img => (
                            <div key={img.name} className="bg-white border border-slate-200 rounded-sm overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                               <div className="aspect-square bg-slate-100 overflow-hidden relative">
                                  <img 
                                     src={`${API_URL}/api/photoroom/debug-images/raw/${img.name}`} 
                                     alt={img.name} 
                                     className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                                  />
                               </div>
                               <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                                  <div className="text-[9px] font-black text-slate-800 break-all leading-tight mb-2 uppercase" title={img.name}>
                                     {img.name.replace('photoroom_debug_raw_', '')}
                                  </div>
                                  <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                                     {new Date(img.createdAt).toLocaleString()}
                                  </div>
                               </div>
                            </div>
                         ))}
                      </div>
                   )}
                </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanelView;
