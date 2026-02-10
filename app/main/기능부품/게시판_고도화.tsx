'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function BoardAdvanced() {
  const [activeBoard, setActiveBoard] = useState('공지');
  const [posts, setPosts] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [selectedPost, setSelectedPost] = useState<any>(null);

  const boards = [
    { id: '공지', label: '📢 공지사항' },
    { id: '자유', label: '💬 자유게시판' },
    { id: '수술', label: '🏥 수술일정표' },
    { id: 'mri', label: '🔬 MRI일정표' },
  ];

  useEffect(() => {
    fetchPosts();
  }, [activeBoard]);

  const fetchPosts = async () => {
    const { data } = await supabase
      .from('board_posts')
      .select('*')
      .eq('board_type', activeBoard)
      .order('created_at', { ascending: false });
    setPosts(data || []);
  };

  const createPost = async () => {
    if (!formData.title) {
      alert('제목을 입력해주세요.');
      return;
    }

    const newPost = {
      board_type: activeBoard,
      title: formData.title,
      content: formData.content,
      author: formData.author || '작성자',
      created_at: new Date().toISOString(),
      ...formData,
    };

    const { error } = await supabase
      .from('board_posts')
      .insert([newPost]);

    if (!error) {
      setFormData({});
      setShowCreateModal(false);
      fetchPosts();
    }
  };

  const deletePost = async (postId: string) => {
    await supabase.from('board_posts').delete().eq('id', postId);
    fetchPosts();
  };

  return (
    <div className="space-y-6">
      {/* 게시판 탭 */}
      <div className="flex gap-3 border-b border-gray-200 pb-4">
        {boards.map((board) => (
          <button
            key={board.id}
            onClick={() => setActiveBoard(board.id)}
            className={`px-6 py-3 font-black text-sm transition-all rounded-lg ${
              activeBoard === board.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {board.label}
          </button>
        ))}
      </div>

      {/* 작성 버튼 */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-black hover:bg-blue-700 transition-all"
        >
          + 새 글 작성
        </button>
      </div>

      {/* 게시물 목록 */}
      <div className="space-y-4">
        {posts.length > 0 ? (
          posts.map((post) => (
            <div
              key={post.id}
              onClick={() => setSelectedPost(post)}
              className="bg-white border border-gray-100 shadow-sm rounded-xl p-6 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <h3 className="font-black text-lg text-gray-800 group-hover:text-blue-600 transition-all">
                    {post.title}
                  </h3>
                  <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                    {post.content}
                  </p>

                  {/* 수술/MRI 상세 정보 표시 */}
                  {(activeBoard === '수술' || activeBoard === 'mri') && (
                    <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="font-bold text-gray-600">
                          {activeBoard === '수술' ? '수술명' : '검사명'}
                        </p>
                        <p className="font-black text-gray-800 mt-1">
                          {post.surgery_name || post.exam_name || '-'}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="font-bold text-gray-600">환자명</p>
                        <p className="font-black text-gray-800 mt-1">
                          {post.patient_name || '-'}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="font-bold text-gray-600">예정 시간</p>
                        <p className="font-black text-gray-800 mt-1">
                          {post.scheduled_time || '-'}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="font-bold text-gray-600">담당의</p>
                        <p className="font-black text-gray-800 mt-1">
                          {post.doctor_name || '-'}
                        </p>
                      </div>
                      {activeBoard === '수술' && (
                        <>
                          <div className="bg-blue-50 p-3 rounded-lg">
                            <p className="font-bold text-blue-600">금식</p>
                            <p className="font-black text-blue-800 mt-1">
                              {post.fasting ? '필수' : '불필요'}
                            </p>
                          </div>
                          <div className="bg-blue-50 p-3 rounded-lg">
                            <p className="font-bold text-blue-600">보호자</p>
                            <p className="font-black text-blue-800 mt-1">
                              {post.guardian ? '있음' : '없음'}
                            </p>
                          </div>
                          <div className="bg-red-50 p-3 rounded-lg">
                            <p className="font-bold text-red-600">수혈</p>
                            <p className="font-black text-red-800 mt-1">
                              {post.blood_transfusion ? '필요' : '불필요'}
                            </p>
                          </div>
                          <div className="bg-gray-50 p-3 rounded-lg">
                            <p className="font-bold text-gray-600">특이사항</p>
                            <p className="font-black text-gray-800 mt-1 text-xs">
                              {post.notes || '-'}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">
                    {new Date(post.created_at).toLocaleDateString('ko-KR')}
                  </p>
                  <p className="text-xs font-bold text-gray-600 mt-1">
                    {post.author}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400 font-bold">게시물이 없습니다.</p>
          </div>
        )}
      </div>

      {/* 작성 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-gray-800 mb-6">
              {boards.find((b) => b.id === activeBoard)?.label} - 새 글 작성
            </h3>

            <div className="space-y-4">
              {/* 기본 정보 */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  제목 *
                </label>
                <input
                  type="text"
                  value={formData.title || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="제목을 입력하세요"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  내용
                </label>
                <textarea
                  value={formData.content || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  placeholder="내용을 입력하세요"
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* 수술/MRI 상세 정보 */}
              {(activeBoard === '수술' || activeBoard === 'mri') && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        {activeBoard === '수술' ? '수술명' : '검사명'} *
                      </label>
                      <input
                        type="text"
                        value={
                          formData[
                            activeBoard === '수술'
                              ? 'surgery_name'
                              : 'exam_name'
                          ] || ''
                        }
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            [activeBoard === '수술'
                              ? 'surgery_name'
                              : 'exam_name']: e.target.value,
                          })
                        }
                        placeholder="수술명/검사명 입력"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        환자명 *
                      </label>
                      <input
                        type="text"
                        value={formData.patient_name || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            patient_name: e.target.value,
                          })
                        }
                        placeholder="환자명 입력"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        예정 시간 *
                      </label>
                      <input
                        type="datetime-local"
                        value={formData.scheduled_time || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            scheduled_time: e.target.value,
                          })
                        }
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        담당의 *
                      </label>
                      <input
                        type="text"
                        value={formData.doctor_name || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            doctor_name: e.target.value,
                          })
                        }
                        placeholder="담당의명 입력"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {activeBoard === '수술' && (
                    <>
                      <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.fasting || false}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                fasting: e.target.checked,
                              })
                            }
                            className="w-5 h-5"
                          />
                          <span className="font-bold text-gray-700">
                            금식 필수
                          </span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.guardian || false}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                guardian: e.target.checked,
                              })
                            }
                            className="w-5 h-5"
                          />
                          <span className="font-bold text-gray-700">
                            보호자 있음
                          </span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.blood_transfusion || false}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                blood_transfusion: e.target.checked,
                              })
                            }
                            className="w-5 h-5"
                          />
                          <span className="font-bold text-gray-700">
                            수혈 필요
                          </span>
                        </label>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                          특이사항
                        </label>
                        <textarea
                          value={formData.notes || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, notes: e.target.value })
                          }
                          placeholder="특이사항 입력"
                          rows={3}
                          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              {/* 버튼 */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData({});
                  }}
                  className="flex-1 py-3 bg-gray-100 text-gray-800 rounded-lg font-bold hover:bg-gray-200 transition-all"
                >
                  취소
                </button>
                <button
                  onClick={createPost}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all"
                >
                  작성
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
