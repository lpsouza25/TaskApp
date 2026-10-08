import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, 
  SafeAreaView, Dimensions, Animated, KeyboardAvoidingView, Platform, Modal, Pressable
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { Check, Trash2, Plus, Eye, EyeOff, X, Save, Calendar } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

const { width } = Dimensions.get('window');

// --- DYNAMIC CALENDAR SCALE CALCULATION ---
const AVAILABLE_WIDTH = width - 80;
const CALENDAR_SCALE = Platform.OS === 'ios' ? AVAILABLE_WIDTH / 320 : 1;

// --- SAFE DATE UTILITIES TO PREVENT IOS CRASHES ---
const parseDateString = (dateStr) => {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
  return new Date();
};

const formatDateToString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// --- UNIVERSAL GOLD COIN COMPONENT ---
const GoldCoin = ({ size }) => {
  const innerSize = size * 0.75;
  const fontSize = size * 0.3;

  return (
    <View style={[styles.goldCoinOuter, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={[styles.goldCoinInner, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
        <Text style={[styles.dollarSign, { fontSize: fontSize }]}>$</Text>
      </View>
    </View>
  );
};

export default function App() {
  const [tab, setTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [totalCoins, setTotalCoins] = useState(0);
  const [hideFinished, setHideFinished] = useState(false);
  
  // Lazy Loading Pagination States
  const [pastLimit, setPastLimit] = useState(0); 
  const [futureLimit, setFutureLimit] = useState(20); 
  
  // Scroll Position Jump Preventer States
  const scrollViewRef = useRef(null);
  const [oldContentHeight, setOldContentHeight] = useState(0);
  const [isPrepending, setIsPrepending] = useState(false);

  // Form States
  const [taskName, setTaskName] = useState('');
  const [taskDate, setTaskDate] = useState(formatDateToString(new Date()));
  const [taskCoins, setTaskCoins] = useState('10');
  
  // Bank Form States
  const [wDesc, setWDesc] = useState('');
  const [wAmount, setWAmount] = useState('');
  const [particles, setParticles] = useState([]);
  const [withdrawalLimit, setWithdrawalLimit] = useState(5);

// Common Tasks List
  const [commonTasks] = useState([
    { id: 'c1', name: 'Exercise', coins: 10 },
    { id: 'c2', name: 'Physical therapy', coins: 10 },
    { id: 'c3', name: 'Cleaning', coins: 10 },
    { id: 'c4', name: 'Laundry', coins: 20 },
    { id: 'c5', name: 'Putting away laundry', coins: 15 },
    { id: 'c6', name: 'Focused meeting', coins: 8 },
    { id: 'c7', name: 'Stretching', coins: 5 },
  ]);

  // Quick Withdraws List
  const [quickWithdraws] = useState([
    { id: 'qw1', desc: 'Snack', amount: 10 },
    { id: 'qw2', desc: 'Extra app time', amount: 10 },
  ]);

// Edit Modal States
  const [editingTask, setEditingTask] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCoins, setEditCoins] = useState('');
  const [editDate, setEditDate] = useState('');

  // Date Picker Engine State
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState('add'); 

  // Google Sheets Cloud Sync Engine
  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzl6HZNuTVUKKY4-jscEY1gRAOBKEZB5Co0a8qmhE17IqvDkdL5_9cETKnBF8QH_7V1HA/exec';
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { calculateTotal(); }, [tasks, withdrawals]);

  // Handler to add a completed common task with 1 tap
  const completeCommonTask = (ct) => {
    const today = formatDateToString(new Date());
    const newTasks = [...tasks, {
      id: Date.now().toString(),
      name: ct.name,
      date: today,
      coins: ct.coins,
      earnedCoins: ct.coins,
      isDone: true,
      completedDate: today
    }];
    setTasks(newTasks);
    saveData(newTasks, withdrawals);
    triggerCoinAnimation();
  };

  // Handler to execute a quick withdraw as a task-timeline spend entry
  const executeQuickWithdraw = (qw) => {
    if (qw.amount > totalCoins) return;
    const today = formatDateToString(new Date());
    const newTasks = [...tasks, {
      id: Date.now().toString(),
      name: qw.desc,
      date: today,
      coins: -qw.amount,
      earnedCoins: -qw.amount,
      isDone: true,
      completedDate: today,
      isSpend: true
    }];
    setTasks(newTasks);
    saveData(newTasks, withdrawals);
    triggerCoinAnimation();
  };

const loadData = async () => {
    try {
      console.log("Fetching from Google Sheets...");
      const response = await fetch(SCRIPT_URL);
      const cloudData = await response.json();
      
      // Look for the specific objects from the generic JSON blob saved in cell A1
      if (cloudData && cloudData.tasks) {
        setTasks(cloudData.tasks);
        if (cloudData.withdrawals) setWithdrawals(cloudData.withdrawals);
        if (cloudData.hidePref !== undefined) setHideFinished(cloudData.hidePref);
        console.log("Cloud load successful.");
      } else {
        console.log("Sheet is empty or unformatted. Starting fresh.");
      }
    } catch (e) { 
      console.error("Cloud fetch failed:", e); 
    }
  };

  const saveData = async (newTasks, newWith, newHidePref) => {
    setIsSyncing(true);
    try {
      const payload = {
        tasks: newTasks,
        withdrawals: newWith,
        hidePref: newHidePref !== undefined ? newHidePref : hideFinished
      };

      await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log("Cloud sync complete.");
    } catch (e) { 
      console.error("Cloud sync failed:", e); 
    } finally {
      setIsSyncing(false);
    }
  };

  const calculateTotal = () => {
    let total = 0;
    tasks.forEach(t => {
      if (t.isDone) {
        total += t.earnedCoins !== undefined ? t.earnedCoins : t.coins;
      }
    });
    withdrawals.forEach(w => total -= w.amount);
    setTotalCoins(total);
  };

  const addTask = () => {
    const coinVal = parseInt(taskCoins);
    if (!taskName || !taskName.trim() || isNaN(coinVal) || coinVal > 99) return;
    
    const newTasks = [...tasks, {
      id: Date.now().toString(),
      name: taskName,
      date: taskDate,
      coins: coinVal,
      isDone: false
    }];
    setTasks(newTasks);
    saveData(newTasks, withdrawals);
    setTaskName('');
    setTaskCoins('10');
  };

  const toggleTask = (id) => {
    const target = tasks.find(t => t.id === id);
    if (target && target.isSpend) return; // Quick spends cannot be untoggled

    const today = formatDateToString(new Date());
    const newTasks = tasks.map(t => {
      if (t.id === id) {
        const nextIsDone = !t.isDone;
        let earned = t.coins;
        if (nextIsDone && t.date < today) {
          const daysLate = Math.floor((new Date(today) - new Date(t.date)) / 86400000);
          earned = Math.max(1, t.coins - daysLate);
        }
        return { 
          ...t, 
          isDone: nextIsDone, 
          earnedCoins: nextIsDone ? earned : undefined,
          completedDate: nextIsDone ? today : undefined 
        };
      }
      return t;
    });
    setTasks(newTasks);
    saveData(newTasks, withdrawals);
  };

  const deleteTask = (id) => {
    const target = tasks.find(t => t.id === id);
    if (target && target.isDone) return;
    const newTasks = tasks.filter(t => t.id !== id);
    setTasks(newTasks);
    saveData(newTasks, withdrawals);
  };

  const saveEdit = () => {
    const coinVal = parseInt(editCoins);
    if (isNaN(coinVal) || coinVal > 99) return;
    const updatedTasks = tasks.map(t => 
      t.id === editingTask.id ? { ...t, name: editName, coins: coinVal, date: editDate } : t
    );
    setTasks(updatedTasks);
    saveData(updatedTasks, withdrawals);
    setEditingTask(null);
  };

  const onDateChange = (event, selectedDate) => {
    setShowPicker(false);
    if (selectedDate) {
      const dateString = formatDateToString(selectedDate);
      if (pickerTarget === 'add') setTaskDate(dateString);
      else setEditDate(dateString);
    }
  };

  const openCalendar = (target) => {
    if (showPicker && pickerTarget === target) {
      setShowPicker(false);
    } else {
      setPickerTarget(target);
      setShowPicker(true);
    }
  };

  const getTaskDisplayCoins = (t) => {
    if (t.isDone) return t.earnedCoins ?? t.coins;
    const today = formatDateToString(new Date());
    if (t.date < today) {
      const daysLate = Math.floor((new Date(today) - new Date(t.date)) / 86400000);
      return Math.max(1, t.coins - daysLate);
    }
    return t.coins;
  };

  const checkIsOverdue = (t) => {
    const today = formatDateToString(new Date());
    if (t.isDone) {
      const completionDay = t.completedDate || t.date;
      return t.date < completionDay;
    }
    return t.date < today;
  };

  const handleWithdraw = () => {
    const amount = parseInt(wAmount);
    if (!wDesc || isNaN(amount) || amount > totalCoins) return;
    const today = formatDateToString(new Date());
    const newWith = [...withdrawals, { id: Date.now().toString(), desc: wDesc, amount, date: today }];
    setWithdrawals(newWith);
    saveData(tasks, newWith);
    triggerCoinAnimation();
    setWDesc('');
    setWAmount('');
  };

  const triggerCoinAnimation = () => {
    const newParticles = Array.from({ length: 12 }).map((_, i) => ({
      id: i, x: new Animated.Value(0), y: new Animated.Value(0), opacity: new Animated.Value(1),
    }));
    setParticles(newParticles);
    newParticles.forEach(p => {
      const angle = (Math.random() * Math.PI) + (Math.PI / 4);
      const dist = 100 + Math.random() * 150;
      Animated.parallel([
        Animated.timing(p.x, { toValue: Math.cos(angle) * dist, duration: 800, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: Math.sin(angle) * dist, duration: 800, useNativeDriver: true }),
        Animated.timing(p.opacity, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]).start();
    });
    setTimeout(() => setParticles([]), 1000);
  };

  const handleScrollUpdate = (event) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    if (tab !== 'tasks') return;

    if (contentOffset.y <= 2) {
      setIsPrepending(true);
      setPastLimit(prev => prev + 7); 
    }

    const closeToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 100;
    if (closeToBottom) {
      setFutureLimit(prev => prev + 20);
    }
  };

  const handleContentSizeChange = (w, h) => {
    if (tab !== 'tasks') return; // Prevents scroll locking on Bank/Common tabs
    if (isPrepending && oldContentHeight > 0) {
      const heightDelta = h - oldContentHeight;
      scrollViewRef.current?.scrollTo({ y: heightDelta, animated: false });
      setIsPrepending(false);
    }
    setOldContentHeight(h);
  };

  const todayStr = formatDateToString(new Date());
  const yesterdayStr = formatDateToString(new Date(Date.now() - 86400000));
  const tomorrowStr = formatDateToString(new Date(Date.now() + 86400000));

  // Map ALL tasks by date to calculate accurate daily balances regardless of hideFinished
  const allTasksByDate = {};
  tasks.forEach(t => {
    let targetGroupDate = t.date;
    if (t.isDone) {
      targetGroupDate = t.completedDate || t.date;
    } else if (t.date < todayStr) {
      targetGroupDate = todayStr;
    }
    if (!allTasksByDate[targetGroupDate]) allTasksByDate[targetGroupDate] = [];
    allTasksByDate[targetGroupDate].push(t);
  });

  const visibleTasks = tasks.filter(t => hideFinished ? !t.isDone : true);

  const masterGroups = {};
  visibleTasks.forEach(t => {
    let targetGroupDate = t.date;
    if (t.isDone) {
      targetGroupDate = t.completedDate || t.date;
    } else if (t.date < todayStr) {
      targetGroupDate = todayStr; 
    }

    if (!masterGroups[targetGroupDate]) masterGroups[targetGroupDate] = [];
    masterGroups[targetGroupDate].push(t);
  });

  if (!masterGroups[todayStr]) masterGroups[todayStr] = [];

  const rawSortedKeys = Object.keys(masterGroups).sort();
  let accumulatedFutureTasks = 0;
  const renderedDates = [];
  const renderedGroups = {};

  rawSortedKeys.forEach(dateKey => {
    if (dateKey === todayStr) {
      renderedDates.push(dateKey);
      renderedGroups[dateKey] = masterGroups[dateKey];
    } else if (dateKey < todayStr) {
      const dayDiff = Math.floor((new Date(todayStr) - new Date(dateKey)) / 86400000);
      if (dayDiff <= pastLimit) {
        renderedDates.push(dateKey);
        renderedGroups[dateKey] = masterGroups[dateKey];
      }
    } else {
      const futureTasksInGroup = masterGroups[dateKey] || [];
      const allowedFutureTasks = [];

      futureTasksInGroup.forEach(task => {
        if (accumulatedFutureTasks < futureLimit) {
          allowedFutureTasks.push(task);
          accumulatedFutureTasks++;
        }
      });

      if (allowedFutureTasks.length > 0) {
        renderedDates.push(dateKey);
        renderedGroups[dateKey] = allowedFutureTasks;
      }
    }
  });

  const getSectionLabel = (dateKey) => {
    if (dateKey === todayStr) return 'TODAY';
    if (dateKey === yesterdayStr) return 'YESTERDAY';
    if (dateKey === tomorrowStr) return 'TOMORROW';
    return dateKey;
  };

  const isTaskCoinsInvalid = parseInt(taskCoins) > 99;
  const isEditCoinsInvalid = parseInt(editCoins) > 99;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>

          {/* EDIT MODAL OVERLAY */}
          <Modal visible={!!editingTask} animationType="fade" transparent>
            <Pressable style={styles.modalBackdrop} onPress={() => setShowPicker(false)}>
              <View style={[styles.sharedBoxStyle, styles.modalWidth]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit Task</Text>
                  <TouchableOpacity onPress={() => setEditingTask(null)}>
                    <X size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.formField}>
                  <Text style={styles.label}>TASK NAME</Text>
                  <TextInput style={styles.input} value={editName} onChangeText={setEditName} onFocus={() => setShowPicker(false)} />
                </View>

                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
                  <View style={[styles.formField, { flex: 1 }]}>
                    <Text style={styles.label}>DUE DATE</Text>
                    <TouchableOpacity onPress={() => openCalendar('edit')} style={styles.dateSelector}>
                      <Text style={styles.dateSelectorText}>{editDate}</Text>
                      <Calendar size={16} color="#6366f1" />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.formField, { width: 80 }]}>
                    <Text style={styles.label}>COINS</Text>
                    <TextInput 
                      style={[styles.input, isEditCoinsInvalid && styles.inputError]} 
                      value={editCoins} 
                      onChangeText={setEditCoins} 
                      keyboardType="numeric" 
                      onFocus={() => setShowPicker(false)} 
                    />
                  </View>
                </View>

                {showPicker && pickerTarget === 'edit' && (
                  Platform.OS === 'web' ? (
                    <TextInput
                      style={[styles.input, { marginTop: 10 }]}
                      type="date"
                      value={editDate}
                      onChangeText={(text) => {
                        setEditDate(text);
                        setShowPicker(false);
                      }}
                    />
                  ) : (
                    <View style={[styles.calendarWrapper, { transform: [{ scale: CALENDAR_SCALE }] }]} onTouchStart={(e) => e.stopPropagation()}>
                      <DateTimePicker
                        value={parseDateString(editDate)}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'inline' : 'default'}
                        onChange={onDateChange}
                      />
                    </View>
                  )
                )}

                <TouchableOpacity 
                  style={[styles.saveBtn, isEditCoinsInvalid && styles.btnDisabled]} 
                  onPress={saveEdit}
                  disabled={isEditCoinsInvalid}
                >
                  <Save size={18} color="white" style={{marginRight: 8}} />
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Modal>

          {/* PRIMARY HEADER */}
          <View style={styles.header}>
            <Text style={styles.title}>{tab === 'tasks' ? 'Tasks' : tab === 'bank' ? 'Bank' : 'Common'}</Text>
            <View style={styles.headerBalance}>
              <View style={styles.coinDisplay}>
                <GoldCoin size={35} />
                {particles.map(p => (
                  <Animated.View key={p.id} style={[styles.particle, { transform: [{ translateX: p.x }, { translateY: p.y }], opacity: p.opacity }]}>
                    <GoldCoin size={25} />
                  </Animated.View>
                ))}
              </View>
              <Text style={styles.headerBalanceText}>{totalCoins}</Text>
            </View>
          </View>

          {/* TAB CONTROLLERS */}
          <View style={styles.tabBar}>
            <TouchableOpacity onPress={() => setTab('tasks')} style={[styles.tab, tab === 'tasks' && styles.activeTab]}>
              <Text style={[styles.tabText, tab === 'tasks' && styles.activeTabText]}>Tasks</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('common')} style={[styles.tab, tab === 'common' && styles.activeTab]}>
              <Text style={[styles.tabText, tab === 'common' && styles.activeTabText]}>Common</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('bank')} style={[styles.tab, tab === 'bank' && styles.activeTab]}>
              <Text style={[styles.tabText, tab === 'bank' && styles.activeTabText]}>Bank</Text>
            </TouchableOpacity>
          </View>

          {/* MODULE CHANGED: Extracted from scroll container hierarchy to enforce strict stickiness layout rules */}
          {tab === 'tasks' && (
            <View style={styles.secondaryActionRow}>
              <TouchableOpacity style={styles.hideToggleButton} onPress={() => {const v = !hideFinished; setHideFinished(v); saveData(tasks, withdrawals, v);}}>
                {hideFinished ? <Eye size={14} color="#64748b" /> : <EyeOff size={14} color="#64748b" />}
                <Text style={styles.hideToggleText}>{hideFinished ? "Show Finished" : "Hide Finished"}</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView 
            ref={scrollViewRef}
            contentContainerStyle={styles.scrollContent}
            onScroll={handleScrollUpdate}
            onScrollBeginDrag={() => setShowPicker(false)}
            scrollEventThrottle={16}
            onContentSizeChange={handleContentSizeChange}
          >
            {tab === 'tasks' ? (
              <>
                {/* TIMELINE RENDER SECTIONS */}
                {renderedDates.map((dateKey, index) => {
                  const tasksInSection = renderedGroups[dateKey] || [];
                  const sortedTasks = tasksInSection.sort((a, b) => a.isDone - b.isDone || a.name.localeCompare(b.name));

                  // Calculate net daily balance across ALL tasks for this date (including hidden ones)
                  const allTasksForDate = allTasksByDate[dateKey] || [];
                  const dayBalance = allTasksForDate.reduce((sum, t) => t.isDone ? sum + (t.earnedCoins ?? t.coins) : sum, 0);

                  return (
                    <View key={dateKey} style={{ marginBottom: 5 }}>
                      <View style={[styles.sectionHeaderRow, index === 0 && { marginTop: 0 }]}>
                        <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>
                          {getSectionLabel(dateKey)}
                        </Text>
                        <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>
                          {dayBalance}
                        </Text>
                      </View>
                      
                      {sortedTasks.length === 0 && dateKey === todayStr && (
                        <Text style={styles.emptyTasksText}>No tasks for today!</Text>
                      )}

                      {sortedTasks.map(t => {
                        const isOverdue = checkIsOverdue(t);
                        return (
                          <Swipeable key={t.id} renderRightActions={() => {
                            if (t.isDone) return null;
                            return (
                              <TouchableOpacity onPress={() => deleteTask(t.id)} style={styles.deleteAction}>
                                <Trash2 color="white" size={24} />
                              </TouchableOpacity>
                            );
                          }}>
                            <TouchableOpacity activeOpacity={t.isDone ? 1 : 0.7} onPress={() => { if(!t.isDone) { setEditingTask(t); setEditName(t.name); setEditCoins(t.coins.toString()); setEditDate(t.date); } }}>
                              <View style={[
                                styles.taskItem, 
                                t.isDone && !t.isSpend && styles.doneItem, 
                                isOverdue && styles.overdueItem,
                                t.isSpend && { backgroundColor: '#fef2f2', borderColor: '#fecaca', opacity: 0.9 }
                              ]}>
                                <TouchableOpacity onPress={() => toggleTask(t.id)} style={[
                                  styles.check, 
                                  t.isDone && styles.checked,
                                  t.isSpend && { backgroundColor: '#ef4444', borderColor: '#ef4444' }
                                ]}>
                                  {t.isSpend ? (
                                    <Text style={{ color: 'white', fontWeight: '900', fontSize: 16 }}>-</Text>
                                  ) : (
                                    t.isDone && <Check color="white" size={16} strokeWidth={4} />
                                  )}
                                </TouchableOpacity>
                                <View style={{ flex: 1, marginRight: 15 }}>
                                  <Text style={[styles.taskName, t.isDone && !t.isSpend && styles.doneText]}>{t.name}</Text>
                                  {isOverdue && <Text style={styles.overdueText}>Was due: {t.date}</Text>}
                                </View>
                                <View style={styles.alignedCoinSlot}>
                                  <GoldCoin size={29} />
                                  <Text style={[styles.coinValueLabel, t.isSpend && { color: '#ef4444' }]}>{getTaskDisplayCoins(t)}</Text>
                                </View>
                              </View>
                            </TouchableOpacity>
                          </Swipeable>
                        );
                      })}
                    </View>
                  );
                })}
              </>
            ) : tab === 'bank' ? (
                  <View style={styles.bankTabWrapper}>
                    <View style={styles.sharedBoxStyle}>
                      <View style={styles.formField}>
                        <Text style={styles.label}>REWARD NAME</Text>
                        <TextInput style={styles.input} value={wDesc} onChangeText={setWDesc} placeholder="Pizza, Games..." onFocus={() => setShowPicker(false)} />
                      </View>
                      <View style={styles.formField}>
                        <Text style={styles.label}>COST</Text>
                        <TextInput style={styles.input} value={wAmount} onChangeText={setWAmount} keyboardType="numeric" placeholder="50" onFocus={() => setShowPicker(false)} />
                      </View>
                      <TouchableOpacity disabled={!wDesc || !wAmount || parseInt(wAmount) > totalCoins} onPress={handleWithdraw} style={[styles.withdrawBtn, (!wDesc || !wAmount || parseInt(wAmount) > totalCoins) && { opacity: 0.5 }]}>
                        <Text style={styles.withdrawBtnText}>Spend Coins</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.sectionTitle}>PURCHASE HISTORY</Text>
                {(() => {
                  const slicedWith = withdrawals.slice().reverse().slice(0, withdrawalLimit);
                  const groupedWith = {};
                  slicedWith.forEach(w => {
                    const d = w.date || todayStr;
                    if (!groupedWith[d]) groupedWith[d] = [];
                    groupedWith[d].push(w);
                  });

                  return Object.keys(groupedWith).map(dateKey => (
                    <View key={dateKey}>
                      <Text style={styles.sectionTitle}>{getSectionLabel(dateKey)}</Text>
                      {groupedWith[dateKey].map(w => (
                        <View key={w.id} style={styles.historyItem}>
                          <Text style={styles.historyDesc}>{w.desc}</Text>
                          <View style={styles.coinValueContainer}>
                            <Text style={styles.historyAmount}>-{w.amount}</Text>
                            <GoldCoin size={25} />
                          </View>
                        </View>
                      ))}
                    </View>
                  ));
                })()}

                {withdrawals.length > withdrawalLimit && (
                  <TouchableOpacity 
                    style={{ alignItems: 'center', marginTop: 10, marginBottom: 15 }} 
                    onPress={() => setWithdrawalLimit(prev => prev + 10)}
                  >
                    <View style={styles.hideToggleButton}>
                      <Text style={styles.hideToggleText}>Show 10 more</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
                ) : (
                  /* COMMON TASKS & QUICK WITHDRAWS TAB VIEW */
                  <View style={styles.bankTabWrapper}>
                    <Text style={[styles.sectionTitle, { marginTop: 0 }]}>QUICK ADD TASKS</Text>
                    {commonTasks.map(ct => (
                      <TouchableOpacity
                        key={ct.id}
                        activeOpacity={0.7}
                        onPress={() => completeCommonTask(ct)}
                      >
                        <View style={styles.taskItem}>
                          <View style={[styles.check, { borderColor: '#6366f1', justifyContent: 'center', alignItems: 'center' }]}>
                            <Plus color="#6366f1" size={16} strokeWidth={3} />
                          </View>
                          <View style={{ flex: 1, marginRight: 15 }}>
                            <Text style={styles.taskName}>{ct.name}</Text>
                          </View>
                          <View style={styles.alignedCoinSlot}>
                            <GoldCoin size={29} />
                            <Text style={styles.coinValueLabel}>{ct.coins}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}

                    <Text style={[styles.sectionTitle, { marginTop: 20 }]}>QUICK SPEND COINS</Text>
                    {quickWithdraws.map(qw => {
                      const disabled = qw.amount > totalCoins;
                      return (
                        <TouchableOpacity
                          key={qw.id}
                          activeOpacity={disabled ? 1 : 0.7}
                          disabled={disabled}
                          onPress={() => executeQuickWithdraw(qw)}
                        >
                          <View style={[
                            styles.taskItem, 
                            { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
                            disabled && { opacity: 0.5 }
                          ]}>
                            <View style={[styles.check, { borderColor: '#ef4444', justifyContent: 'center', alignItems: 'center' }]}>
                              <Text style={{ color: '#ef4444', fontWeight: '900', fontSize: 16 }}>-</Text>
                            </View>
                            <View style={{ flex: 1, marginRight: 15 }}>
                              <Text style={styles.taskName}>{qw.desc}</Text>
                            </View>
                            <View style={styles.alignedCoinSlot}>
                              <GoldCoin size={29} />
                              <Text style={[styles.coinValueLabel, { color: '#ef4444' }]}>-{qw.amount}</Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </ScrollView>

          {/* FLOATING TASK ADD FORM */}
          {tab === 'tasks' && !editingTask && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.formContainer}>
              <View style={[styles.sharedBoxStyle, styles.floatingFormExtra]}>
                <View style={styles.formField}>
                  <Text style={styles.label}>TASK NAME</Text>
                  <TextInput 
                    style={styles.input} 
                    placeholder="What needs doing?" 
                    value={taskName} 
                    onChangeText={setTaskName} 
                    onFocus={() => setShowPicker(false)} 
                  />
                </View>
                
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
                  <View style={[styles.formField, { flex: 1 }]}>
                    <Text style={styles.label}>DUE DATE</Text>
                    <TouchableOpacity onPress={() => openCalendar('add')} style={styles.dateSelector}>
                      <Text style={styles.dateSelectorText}>{taskDate}</Text>
                      <Calendar size={16} color="#6366f1" />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.formField, { width: 80 }]}>
                    <Text style={styles.label}>COINS</Text>
                    <TextInput 
                      style={[styles.input, isTaskCoinsInvalid && styles.inputError]} 
                      value={taskCoins} 
                      onChangeText={setTaskCoins} 
                      keyboardType="numeric" 
                      onFocus={() => setShowPicker(false)} 
                    />
                  </View>
                  
                  <TouchableOpacity 
                    onPress={addTask} 
                    style={[styles.addBtn, isTaskCoinsInvalid && styles.btnDisabled]} 
                    disabled={isTaskCoinsInvalid}
                  >
                    <Plus color="white" />
                  </TouchableOpacity>
                </View>

                {showPicker && pickerTarget === 'add' && (
                  Platform.OS === 'web' ? (
                    <TextInput
                      style={[styles.input, { marginTop: 10 }]}
                      type="date"
                      value={taskDate}
                      onChangeText={(text) => {
                        setTaskDate(text);
                        setShowPicker(false);
                      }}
                    />
                  ) : (
                    <View style={[styles.calendarWrapper, { transform: [{ scale: CALENDAR_SCALE }] }]} onTouchStart={(e) => e.stopPropagation()}>
                      <DateTimePicker
                        value={parseDateString(taskDate)}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'inline' : 'default'}
                        onChange={onDateChange}
                      />
                    </View>
                  )
                )}
              </View>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fdfbf7' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  title: { fontSize: 32, fontWeight: '900', color: '#1e293b' },
  headerBalance: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBalanceText: { fontSize: 18, fontWeight: '900', color: '#f59e0b' },
  coinDisplay: { position: 'relative' },
  coinValueContainer: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  alignedCoinSlot: { alignItems: 'center', flexDirection: 'row', gap: 6, width: 65, justifyContent: 'flex-start' },
  coinValueLabel: { fontSize: 16, fontWeight: '900', color: '#f59e0b' },
  goldCoinOuter: { backgroundColor: '#DAA520', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#B8860B', elevation: 3, shadowColor: '#000', shadowOffset: { width: 1, height: 2 }, shadowOpacity: 0.2 },
  goldCoinInner: { backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#DAA520' },
  dollarSign: { fontWeight: '900', color: '#B8860B' },
  particle: { position: 'absolute', top: 5, left: 5, zIndex: 10 },
  
  // MODULE CHANGED: Cleared bottom margin layout properties
  tabBar: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 0 },
  
  tab: { flex: 1, padding: 12, borderRadius: 15, backgroundColor: '#e2e8f0', alignItems: 'center' },
  activeTab: { backgroundColor: '#6366f1' },
  tabText: { fontWeight: '700', color: '#64748b' },
  activeTabText: { color: 'white' },
  bankTabWrapper: { marginTop: 12 },
  secondaryActionRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, marginTop: 12, marginBottom: 12 },

  scrollContent: { paddingHorizontal: 20, paddingBottom: 320 },
  hideToggleButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#f1f5f9' },
  hideToggleText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 1.5, marginBottom: 10, marginTop: 15 },
  emptyTasksText: { fontSize: 13, fontWeight: '600', color: '#94a3b8', fontStyle: 'italic', paddingLeft: 4, marginBottom: 10 },
  taskItem: { backgroundColor: 'white', padding: 16, borderRadius: 22, flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 2, borderColor: '#f1f5f9' },
  overdueItem: { backgroundColor: '#fff1f2', borderColor: '#fee2e2' },
  doneItem: { opacity: 0.5 },
  check: { width: 28, height: 28, borderRadius: 9, borderWidth: 3, borderColor: '#e2e8f0', marginRight: 15, justifyContent: 'center', alignItems: 'center' },
  checked: { backgroundColor: '#10b981', borderColor: '#10b981' },
  taskName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  doneText: { textDecorationLine: 'line-through', color: '#94a3b8' },
  overdueText: { fontSize: 11, color: '#ef4444', fontWeight: '800' },
  dateText: { fontSize: 11, color: '#6366f1', fontWeight: '800' },
  deleteAction: { backgroundColor: '#ff4757', justifyContent: 'center', alignItems: 'center', width: 80, height: '90%', borderRadius: 22, marginBottom: 12 },
  formContainer: { position: 'absolute', bottom: 0, width: '100%' },
  sharedBoxStyle: { backgroundColor: 'white', padding: 20, borderRadius: 25, borderWidth: 2, borderColor: '#e2e8f0', gap: 12 },
  floatingFormExtra: { marginHorizontal: 20, marginBottom: 25, shadowColor: '#000', shadowRadius: 15, shadowOpacity: 0.1 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(30, 41, 59, 0.4)', justifyContent: 'center', alignItems: 'center' },
  modalWidth: { width: width - 40 }, 
  formField: { gap: 6 }, 
  label: { fontSize: 9, fontWeight: '900', color: '#94a3b8', paddingLeft: 4 },
  input: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 14, borderWidth: 2, borderColor: '#f1f5f9', fontSize: 14 },
  inputError: { borderColor: '#ef4444', backgroundColor: '#fef2f2' },
  dateSelector: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 14, borderWidth: 2, borderColor: '#f1f5f9', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateSelectorText: { fontSize: 14, color: '#1e293b', fontWeight: '600' },
  addBtn: { backgroundColor: '#6366f1', paddingHorizontal: 15, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  calendarWrapper: { width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', borderWidth: 0 },
  saveBtn: { backgroundColor: '#6366f1', padding: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  btnDisabled: { backgroundColor: '#cbd5e1', opacity: 0.8 },
  withdrawBtn: { backgroundColor: '#f59e0b', padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  withdrawBtnText: { color: 'white', fontWeight: '900', fontSize: 16 },
  historyItem: { backgroundColor: 'white', padding: 15, borderRadius: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  historyDesc: { fontWeight: '700', fontSize: 14, color: '#1e293b' },
  historyAmount: { color: '#ef4444', fontWeight: '900', fontSize: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#1e293b' },
  saveBtnText: { color: 'white', fontWeight: '900', fontSize: 16 }
});
